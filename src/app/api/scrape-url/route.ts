import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { RESOLVER_BLACKOUT_MS } from '@/platform/contracts';
import {
  canonicalUrlHmac,
  nextUtcMidnightMs,
  resolverRequestAuthorityName,
  utcDay,
  verifyResolverCapability,
} from '@/platform/resolver/capability';
import { sanitizeResolvedContent } from '@/platform/resolver/html-to-text';
import {
  RESOLVER_BODY_LIMIT,
  assertAllowedResolverUrl,
  fetchWithResolverPolicy,
  readCappedBody,
} from '@/platform/resolver/url-policy';

const STRICT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KNOWN_IDENTITY = /^known:([A-Za-z0-9._-]{1,64}):([0-9a-f]{64})$/;
const inputSchema = z.object({
  url: z.string().min(1),
  urls: z.array(z.string().min(1)).min(1).max(10),
  requestId: z.string().regex(STRICT_UUID),
  resolverCapability: z.string().min(1),
}).strict();

type BeginResult = { status: 'begun'; executionId: string } | { status: 'conflict' | 'expired' | 'day-mismatch' };
type ClaimResult = { status: 'permit'; nonce: string } | { status: 'inflight' | 'complete' | 'unknown' | 'expired' | 'day-mismatch' };
type AdmissionResult =
  | { status: 'admitted'; leaseId: string; expiresAtMs: number }
  | { status: 'busy'; retryAfterSeconds: number }
  | { status: 'daily-limit'; resetAt: string }
  | { status: 'day-rollover' | 'day-mismatch' };

type AuthorityStub = Readonly<{
  begin(input: Record<string, string | number>): Promise<BeginResult>;
  claim(input: Record<string, string | number>): Promise<ClaimResult>;
  complete(input: Record<string, string | number>): Promise<{ status: 'stored' | 'conflict' }>;
}>;
type CounterStub = Readonly<{
  admitResolver(input: Record<string, string | number>): Promise<AdmissionResult>;
  releaseResolver(input: Record<string, string | number>): Promise<{ status: 'released' | 'consumed' | 'conflict' }>;
}>;
type Namespace<Stub> = Readonly<{ idFromName(name: string): unknown; get(id: unknown): Stub }>;

type ResolverRouteEnvironment = Readonly<{
  RESOLVER_CAPABILITY_HMAC: string;
  RESOLVER_REQUEST_AUTHORITY: Namespace<AuthorityStub>;
  RESOLVER_DAILY_COUNTER: Namespace<CounterStub>;
}>;

type Dependencies = Readonly<{
  env: ResolverRouteEnvironment;
  now(): number;
  fetch: typeof fetch;
}>;

export async function POST(request: NextRequest): Promise<Response> {
  let env: ResolverRouteEnvironment;
  try { env = getCloudflareContext().env as ResolverRouteEnvironment; }
  catch { return fixed('resolver_not_ready', 503); }
  return resolveScrapeRequest(request, { env, now: Date.now, fetch });
}

async function resolveScrapeRequest(request: NextRequest, dependencies: Dependencies): Promise<Response> {
  const requestOrigin = new URL(request.url).origin;
  if (request.headers.get('origin') !== requestOrigin) return fixed('invalid_resolver_request', 400);
  const parsedIdentity = parseIdentity(request.headers.get('x-event-every-identity'));
  if (parsedIdentity === null) return fixed('invalid_resolver_request', 400);

  const body = inputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fixed('invalid_resolver_request', 400);

  let canonicalUrl: string;
  try { canonicalUrl = assertAllowedResolverUrl(body.data.url); }
  catch { return fixed('invalid_resolver_request', 400); }

  const nowMs = dependencies.now();
  const capability = await verifyResolverCapability(body.data.resolverCapability, {
    identity: parsedIdentity.header,
    urls: body.data.urls,
    nowMs,
    key: dependencies.env.RESOLVER_CAPABILITY_HMAC,
  });
  if (capability.status !== 'valid' || !capability.payload.urls.includes(canonicalUrl)) {
    return fixed('invalid_resolver_request', 400);
  }

  const authorityDay = utcDay(nowMs);
  if (capability.payload.authorityDay !== authorityDay) return fixed('resolver_day_rollover', 409);
  const requestAuthorityName = await resolverRequestAuthorityName(body.data.requestId);
  const authority = dependencies.env.RESOLVER_REQUEST_AUTHORITY.get(
    dependencies.env.RESOLVER_REQUEST_AUTHORITY.idFromName(requestAuthorityName),
  );
  const counter = dependencies.env.RESOLVER_DAILY_COUNTER.get(
    dependencies.env.RESOLVER_DAILY_COUNTER.idFromName(`${authorityDay}:${parsedIdentity.hmac}`),
  );
  const permitDeadlineMs = Math.min(capability.payload.expiresAtMs, nextUtcMidnightMs(nowMs) - RESOLVER_BLACKOUT_MS);
  const begun = await authority.begin({
    requestId: body.data.requestId,
    authorityDay,
    identityVersion: parsedIdentity.version,
    identityHmac: parsedIdentity.hmac,
    canonicalUrlHmac: await canonicalUrlHmac(dependencies.env.RESOLVER_CAPABILITY_HMAC, canonicalUrl),
    capabilityDigest: capability.capabilityDigest,
    permitDeadlineMs,
    nowMs,
  });
  if (begun.status !== 'begun') return stateFailure(begun.status);

  const admission = await counter.admitResolver({
    executionId: begun.executionId,
    requestAuthorityName,
    identityHmac: parsedIdentity.hmac,
    authorityDay,
    currentUtcDay: utcDay(dependencies.now()),
    nowMs: dependencies.now(),
  });
  if (admission.status !== 'admitted') {
    await authority.complete({ executionId: begun.executionId, outcome: 'failed', nowMs: dependencies.now() });
    if (admission.status === 'busy') return NextResponse.json({ code: 'resolver_busy', retryAfterSeconds: admission.retryAfterSeconds }, { status: 429 });
    if (admission.status === 'daily-limit') return NextResponse.json({ code: 'resolver_daily_limit', resetAt: admission.resetAt }, { status: 429 });
    return fixed('resolver_day_rollover', 409);
  }

  if (request.signal.aborted) {
    await counter.releaseResolver({ executionId: begun.executionId, leaseId: admission.leaseId, phase: 'before-outbound', nowMs: dependencies.now() });
    await authority.complete({ executionId: begun.executionId, outcome: 'unknown', nowMs: dependencies.now() });
    return fixed('resolver_aborted', 408);
  }
  const claimed = await authority.claim({ executionId: begun.executionId, nowMs: dependencies.now(), currentUtcDay: utcDay(dependencies.now()) });
  if (claimed.status !== 'permit') {
    await counter.releaseResolver({ executionId: begun.executionId, leaseId: admission.leaseId, phase: 'before-outbound', nowMs: dependencies.now() });
    await authority.complete({ executionId: begun.executionId, outcome: 'unknown', nowMs: dependencies.now() });
    return stateFailure(claimed.status);
  }
  if (request.signal.aborted) {
    await counter.releaseResolver({ executionId: begun.executionId, leaseId: admission.leaseId, phase: 'before-outbound', nowMs: dependencies.now() });
    await authority.complete({ executionId: begun.executionId, outcome: 'unknown', nowMs: dependencies.now() });
    return fixed('resolver_aborted', 408);
  }

  let fetchResult: Awaited<ReturnType<typeof fetchWithResolverPolicy>> | undefined;
  let outcome: 'success' | 'failed' | 'unknown' = 'failed';
  try {
    fetchResult = await fetchWithResolverPolicy(canonicalUrl, request.signal, dependencies.fetch);
    const { response, signal } = fetchResult;
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return fixed('resolver_upstream_failed', 502);
    }
    const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (mediaType !== 'text/html' && mediaType !== 'text/plain') {
      await response.body?.cancel().catch(() => undefined);
      return fixed('resolver_unsupported_media_type', 415);
    }
    const bytes: Uint8Array | string = await readCappedBody(response.body, RESOLVER_BODY_LIMIT, signal);
    const sanitized = sanitizeResolvedContent(
      typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes),
      mediaType,
    );
    outcome = 'success';
    return NextResponse.json({ url: fetchResult.canonicalUrl, ...sanitized, status: 'success' });
  } catch (error) {
    outcome = request.signal.aborted || isAbort(error) ? 'unknown' : 'failed';
    return fixed(outcome === 'unknown' ? 'resolver_aborted' : 'resolver_fetch_failed', outcome === 'unknown' ? 408 : 502);
  } finally {
    fetchResult?.close();
    await counter.releaseResolver({ executionId: begun.executionId, leaseId: admission.leaseId, phase: 'after-outbound', nowMs: dependencies.now() });
    await authority.complete({ executionId: begun.executionId, outcome, nowMs: dependencies.now() });
  }
}

function parseIdentity(value: string | null): Readonly<{ header: string; version: string; hmac: string }> | null {
  if (value === 'unknown') return { header: value, version: 'unknown', hmac: '0'.repeat(64) };
  const matched = value?.match(KNOWN_IDENTITY);
  return matched ? { header: value!, version: matched[1], hmac: matched[2] } : null;
}

function stateFailure(status: string): Response {
  return status === 'day-mismatch' || status === 'expired'
    ? fixed('resolver_day_rollover', 409)
    : fixed('resolver_conflict', 409);
}
function isAbort(error: unknown): boolean { return error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError'); }
function fixed(code: string, status: number): Response { return NextResponse.json({ code }, { status }); }
