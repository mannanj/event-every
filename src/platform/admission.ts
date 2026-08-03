import type { AdmissionResult } from './contracts';
import { ROUTE_MANIFEST, type RoutePolicy } from './route-manifest';
import {
  INTERNAL_IDENTITY_HEADER,
  deriveEdgeIdentity,
  identityHeaderValue,
  type TrustedEdgeAddressPort,
} from './identity';

export { INTERNAL_IDENTITY_HEADER } from './identity';

type AdmissionBindings = Readonly<{
  IDENTITY_KEY_CURRENT_VERSION: string;
  IDENTITY_HMAC_CURRENT: string;
}>;

type AdmissionFailure = Extract<AdmissionResult, Readonly<{ status: 'failure' }>>;
type BodyReadResult = AdmissionFailure | Readonly<{
  status: 'success';
  bytes: Uint8Array<ArrayBuffer> | null;
}>;

type AdmissionErrorCode =
  | 'route_not_found'
  | 'method_not_allowed'
  | 'route_retired'
  | 'origin_not_allowed'
  | 'unsupported_media_type'
  | 'unsupported_content_encoding'
  | 'body_too_large'
  | 'request_aborted'
  | 'invalid_body';

const ERRORS: Readonly<Record<AdmissionErrorCode, Readonly<{
  status: number;
  error: string;
}>>> = {
  route_not_found: { status: 404, error: 'Route not found.' },
  method_not_allowed: { status: 405, error: 'Method not allowed.' },
  route_retired: { status: 410, error: 'Route retired.' },
  origin_not_allowed: { status: 403, error: 'Origin not allowed.' },
  unsupported_media_type: { status: 415, error: 'Unsupported media type.' },
  unsupported_content_encoding: { status: 415, error: 'Unsupported content encoding.' },
  body_too_large: { status: 413, error: 'Request body too large.' },
  request_aborted: { status: 400, error: 'Request aborted.' },
  invalid_body: { status: 400, error: 'Invalid request body.' },
};

export async function admitEdgeRequest(
  request: Request,
  env: unknown,
  _ctx: unknown,
  trustedEdge: TrustedEdgeAddressPort,
): Promise<AdmissionResult> {
  const pathname = new URL(request.url).pathname;
  const policy = ROUTE_MANIFEST[pathname];
  if (policy === undefined) {
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return rejectAdmission('route_not_found');
    }
    const identity = await deriveEdgeIdentity(request, identityBindings(env), trustedEdge);
    return {
      status: 'success',
      request: rebuildRequest(request, identityHeaderValue(identity)),
      identity,
    };
  }
  if (request.method !== policy.method) {
    return rejectAdmission('method_not_allowed', { Allow: policy.allow });
  }
  if (policy.retired) return rejectAdmission('route_retired');
  if (!isAllowedRequestOrigin(request, policy)) return rejectAdmission('origin_not_allowed');
  if (policy.maxBodyBytes > 0 && !isJsonMediaType(request.headers.get('content-type'))) {
    return rejectAdmission('unsupported_media_type');
  }
  if (!isIdentityEncoding(request.headers.get('content-encoding'))) {
    return rejectAdmission('unsupported_content_encoding');
  }

  const identity = await deriveEdgeIdentity(request, identityBindings(env), trustedEdge);
  const body = await readBoundedBody(request, policy);
  if (body.status === 'failure') return body;

  return {
    status: 'success',
    request: rebuildRequest(request, identityHeaderValue(identity), body.bytes),
    identity,
  };
}

function rebuildRequest(
  request: Request,
  identityHeader: string,
  body?: Uint8Array<ArrayBuffer> | null,
): Request {
  const headers = new Headers(request.headers);
  for (const name of [
    INTERNAL_IDENTITY_HEADER,
    'cf-connecting-ip',
    'x-forwarded-for',
    'x-real-ip',
    'forwarded',
    'true-client-ip',
    'x-client-ip',
    'content-length',
  ]) {
    headers.delete(name);
  }
  headers.set(INTERNAL_IDENTITY_HEADER, identityHeader);

  return new Request(request, {
    headers,
    ...(body === undefined || body === null ? {} : { body: body.buffer }),
  });
}

function identityBindings(env: unknown): AdmissionBindings {
  if (env === null || typeof env !== 'object') {
    return { IDENTITY_KEY_CURRENT_VERSION: '', IDENTITY_HMAC_CURRENT: '' };
  }
  const candidate = env as Record<string, unknown>;
  return {
    IDENTITY_KEY_CURRENT_VERSION: typeof candidate.IDENTITY_KEY_CURRENT_VERSION === 'string'
      ? candidate.IDENTITY_KEY_CURRENT_VERSION
      : '',
    IDENTITY_HMAC_CURRENT: typeof candidate.IDENTITY_HMAC_CURRENT === 'string'
      ? candidate.IDENTITY_HMAC_CURRENT
      : '',
  };
}

function isAllowedRequestOrigin(request: Request, policy: RoutePolicy): boolean {
  return isAllowedOrigin(request, policy);
}

function isAllowedOrigin(request: Request, policy: RoutePolicy): boolean {
  const pathname = new URL(request.url).pathname;
  if (ROUTE_MANIFEST[pathname] !== policy) return false;
  const origin = request.headers.get('origin');
  if (origin === null || origin === '') return pathname !== '/api/scrape-url';
  return origin === new URL(request.url).origin;
}

function isJsonMediaType(value: string | null): boolean {
  if (value === null) return false;
  const [mediaType, ...parameters] = value.split(';');
  if (mediaType.trim().toLowerCase() !== 'application/json') return false;
  return parameters.every((parameter) => parameter.trim().length > 0);
}

function isIdentityEncoding(value: string | null): boolean {
  return value === null || value.trim().toLowerCase() === 'identity';
}

async function readBoundedBody(
  request: Request,
  policy: RoutePolicy,
): Promise<BodyReadResult> {
  if (request.signal.aborted) return rejectAdmission('request_aborted');
  if (request.body === null) return { status: 'success', bytes: null };

  const reader = request.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let totalBytes = 0;
  let cancellation: Promise<void> | undefined;
  const cancelForAbort = () => {
    cancellation ??= reader.cancel().catch(() => undefined);
  };
  request.signal.addEventListener('abort', cancelForAbort, { once: true });

  try {
    while (true) {
      const read = await reader.read().catch(() => undefined);
      if (read === undefined) {
        if (request.signal.aborted) {
          await cancelAndReject(reader, 'request_aborted', cancellation);
          return rejectAdmission('request_aborted');
        }
        await cancelAndReject(reader, 'invalid_body', cancellation);
        return rejectAdmission('invalid_body');
      }

      if (request.signal.aborted) {
        await cancelAndReject(reader, 'request_aborted', cancellation);
        return rejectAdmission('request_aborted');
      }
      if (read.done) break;

      const chunk = read.value;
      totalBytes += chunk.byteLength;
      if (totalBytes > policy.maxBodyBytes) {
        await cancelAndReject(reader, 'body_too_large');
        return rejectAdmission('body_too_large');
      }
      chunks.push(chunk);
    }
  } finally {
    request.signal.removeEventListener('abort', cancelForAbort);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { status: 'success', bytes };
}

async function cancelAndReject(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  _code: 'body_too_large' | 'request_aborted' | 'invalid_body',
  existing?: Promise<void>,
): Promise<void> {
  try {
    await (existing ?? reader.cancel());
  } catch {
    // Rejection is deliberately discarded; the response is fixed and content-free.
  }
}

function rejectAdmission(code: AdmissionErrorCode, headers?: HeadersInit): AdmissionFailure {
  const detail = ERRORS[code];
  return {
    status: 'failure',
    response: Response.json(
      { error: detail.error, code },
      { status: detail.status, headers },
    ),
  };
}
