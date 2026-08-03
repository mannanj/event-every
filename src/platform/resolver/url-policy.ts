import { RESOLVER_URL_MAX_BYTES } from '../contracts';

export const RESOLVER_BODY_LIMIT = 512 * 1024;
export const RESOLVER_DEADLINE_MS = 5_000;
const RESOLVER_MAX_REDIRECTS = 3;
const USER_AGENT = 'EventEveryResolver/1.0';
const encoder = new TextEncoder();

export type ResolverFetchResult = Readonly<{
  response: Response;
  canonicalUrl: string;
  signal: AbortSignal;
  close(): void;
}>;
export type ResolverTimer = Readonly<{
  set(callback: () => void, delay: number): unknown;
  clear(handle: unknown): void;
}>;
const systemTimer: ResolverTimer = {
  set: (callback, delay) => setTimeout(callback, delay),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function assertAllowedScheme(value: URL): void {
  if (value.protocol !== 'http:' && value.protocol !== 'https:') rejectUrl();
}

export function assertAllowedResolverUrl(value: string | URL): string {
  assertNoForbiddenDelimiters(value instanceof URL ? value.href : value);
  let parsed: URL;
  try { parsed = value instanceof URL ? new URL(value.href) : new URL(value); } catch { rejectUrl(); }
  assertAllowedScheme(parsed!);
  if (parsed!.username || parsed!.password || parsed!.hash) rejectUrl();
  if (parsed!.port) rejectUrl();
  const rawHostname = parsed!.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (rawHostname.endsWith('..')) rejectUrl();
  const hostname = rawHostname.replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || !hostname.includes('.') && !hostname.includes(':')) rejectUrl();
  if (hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) rejectUrl();
  const parsedAddress = parseAddress(hostname);
  if (parsedAddress !== null && !addressAllowed(parsedAddress)) rejectUrl();
  if (!hostname.includes(':')) parsed!.hostname = hostname;
  const canonical = parsed!.href;
  const canonicalBytes = encoder.encode(canonical).byteLength;
  if (canonicalBytes > RESOLVER_URL_MAX_BYTES) rejectUrl();
  return canonical;
}

function addressAllowed(parsedAddress: readonly number[]): boolean {
  return isPublicAddress(parsedAddress);
}

export function isPublicAddress(parsedAddress: readonly number[]): boolean {
  if (parsedAddress.length === 4) {
    const [a, b] = parsedAddress;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 0 || b === 168)) return false;
    if (a === 192 && b === 0 && parsedAddress[2] === 2) return false;
    if (a === 198 && (b === 18 || b === 19 || b === 51 && parsedAddress[2] === 100)) return false;
    if (a === 203 && b === 0 && parsedAddress[2] === 113) return false;
    return true;
  }
  const first = parsedAddress[0] ?? 0;
  const second = parsedAddress[1] ?? 0;
  if (first === 0) return false;
  if (first === 0x0064 && second === 0xff9b) return false;
  if (first === 0x0100 && parsedAddress.slice(1, 4).every((part) => part === 0)) return false;
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0 || (first & 0xff00) === 0xff00) return false;
  if (first === 0x2001 && (second <= 0x01ff || second === 0x0db8)) return false;
  if (first === 0x2002 || (first & 0xfff0) === 0x3ff0 || first === 0x5f00) return false;
  if (parsedAddress.slice(0, 5).every((part) => part === 0) && parsedAddress[5] === 0xffff) {
    return isPublicAddress([(parsedAddress[6] >> 8) & 255, parsedAddress[6] & 255, (parsedAddress[7] >> 8) & 255, parsedAddress[7] & 255]);
  }
  return true;
}

export async function fetchWithResolverPolicy(
  initialUrl: string,
  incomingSignal: AbortSignal,
  fetchFn: typeof fetch = fetch,
  timer: ResolverTimer = systemTimer,
): Promise<ResolverFetchResult> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(incomingSignal.reason ?? new DOMException('Aborted', 'AbortError'));
  if (incomingSignal.aborted) forwardAbort();
  else incomingSignal.addEventListener('abort', forwardAbort, { once: true });
  const deadline = timer.set(() => controller.abort(new DOMException('Resolver deadline exceeded', 'TimeoutError')), RESOLVER_DEADLINE_MS);
  const close = () => {
    timer.clear(deadline);
    incomingSignal.removeEventListener('abort', forwardAbort);
  };
  const visited = new Set<string>();
  let currentUrl = assertAllowedResolverUrl(initialUrl);
  try {
    if (controller.signal.aborted) throw controller.signal.reason ?? new DOMException('Aborted', 'AbortError');
    for (let redirects = 0; ; redirects += 1) {
      if (visited.has(currentUrl)) rejectRedirect();
      visited.add(currentUrl);
      const response = await fetchFn(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        referrer: '',
        headers: { Accept: 'text/html, text/plain;q=0.9', 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) {
        return { response, canonicalUrl: currentUrl, signal: controller.signal, close };
      }
      await response.body?.cancel().catch(() => undefined);
      if (redirects >= RESOLVER_MAX_REDIRECTS) rejectRedirect();
      const location = response.headers.get('location');
      if (!location) rejectRedirect();
      assertNoForbiddenDelimiters(location);
      let nextUrl: URL;
      try { nextUrl = new URL(location!, currentUrl); } catch { rejectRedirect(); }
      assertAllowedResolverUrl(nextUrl);
      currentUrl = nextUrl.href;
    }
  } catch (error) {
    close();
    throw error;
  }
}

export async function readCappedBody(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (body === null || limit !== RESOLVER_BODY_LIMIT) throw new Error('resolver_body_unavailable');
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const abort = () => { void reader.cancel(signal.reason).catch(() => undefined); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      const { value, done } = await reader.read();
      if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > RESOLVER_BODY_LIMIT) {
        await reader.cancel().catch(() => undefined);
        throw new Error('resolver_body_too_large');
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function parseAddress(hostname: string): number[] | null {
  if (/^\d+(?:\.\d+){3}$/.test(hostname)) {
    const parts = hostname.split('.').map(Number);
    return parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : [];
  }
  if (!hostname.includes(':')) return null;
  const split = hostname.split('::');
  if (split.length > 2) return [];
  const parseParts = (part: string) => part ? part.split(':').map((value) => /^[0-9a-f]{1,4}$/i.test(value) ? Number.parseInt(value, 16) : -1) : [];
  const left = parseParts(split[0] ?? '');
  const right = parseParts(split[1] ?? '');
  if ([...left, ...right].some((part) => part < 0)) return [];
  const zeros = split.length === 2 ? 8 - left.length - right.length : 0;
  const parts = [...left, ...Array.from({ length: zeros }, () => 0), ...right];
  return parts.length === 8 ? parts : [];
}

function assertNoForbiddenDelimiters(value: string): void {
  if (/[\u0000-\u0020\u007f]/.test(value)) rejectUrl();
  if (value.includes('#')) rejectUrl();
  const authority = value.match(/^[A-Za-z][A-Za-z0-9+.-]*:\/{2,}([^/?#]*)/)?.[1]
    ?? value.match(/^\/{2,}([^/?#]*)/)?.[1];
  if (authority?.includes('@')) rejectUrl();
}

function rejectUrl(): never { throw new Error('resolver_url_rejected'); }
function rejectRedirect(): never { throw new Error('resolver_redirect_rejected'); }
