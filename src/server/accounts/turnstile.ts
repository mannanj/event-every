/**
 * Server-side Turnstile verification.
 *
 * siteverify is called from the server only — never the browser — so the
 * secret never leaves the Worker. A token is single-use: Cloudflare rejects a
 * replay of one it has already seen.
 */
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(args: {
  secret: string;
  token: unknown;
  remoteIp?: string | null;
}): Promise<boolean> {
  if (typeof args.token !== 'string' || args.token.length === 0) return false;

  const body = new URLSearchParams({ secret: args.secret, response: args.token });
  if (args.remoteIp) body.set('remoteip', args.remoteIp);

  try {
    const response = await fetch(SITEVERIFY, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    // A network failure talking to Cloudflare must not open the gate.
    return false;
  }
}

/**
 * A stable, trusted handle for "who sent this", for the second rate-limit
 * bucket.
 *
 * NOT the IP, and not read from a header the caller controls. Edge admission
 * deliberately strips `cf-connecting-ip`, `x-forwarded-for`, `true-client-ip`
 * and the rest before a route handler ever sees the request, and substitutes
 * `x-event-every-identity` - an HMAC of the address over a UTC day, derived
 * where Cloudflare is still the trust boundary. That header is the only
 * identity a route handler can believe.
 *
 * Two earlier versions of this were silently inert in production, both found by
 * the rate_limit table holding email buckets and no ip bucket at all:
 *   1. requiring `request.cf` to be an object - Next's Request has no `cf`
 *   2. reading `cf-connecting-ip` - admission had already deleted it
 * The limit looked configured and counted nothing. Hence the test that asserts
 * a bucket is actually produced.
 *
 * Already a keyed hash, so unlike an address it needs no further hashing to be
 * safe at rest - but it goes through bucketKey anyway, so one rule covers every
 * bucket and no caller has to remember which kinds are already opaque.
 */
export function clientHandle(request: Request): string | null {
  const header = request.headers.get('x-event-every-identity');
  if (!header) return null;
  // `version:hmac`. The hmac alone is the stable part; the version changes on
  // key rotation, which should start fresh windows rather than carry them over.
  return header.length > 0 ? header : null;
}
