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
 * The visitor's IP, and only from Cloudflare.
 *
 * The skeleton falls back to `x-forwarded-for`; this deliberately does not.
 * That header is caller-controlled, so falling back to it would let anyone mint
 * a fresh rate-limit bucket per request by varying one header — defeating the
 * IP limit that exists to stop a single source working through a list of
 * addresses. The accepted migration design records the same rule: Cloudflare is
 * the trust boundary before a value may affect state.
 *
 * `cf` being absent means the request did not arrive through Cloudflare, so no
 * address here is trustworthy. Null is correct then, and the caller treats a
 * null as "IP bucket unavailable" rather than "unlimited".
 */
export function clientIp(request: Request): string | null {
  const cf = (request as Request & Readonly<{ cf?: unknown }>).cf;
  if (cf === null || typeof cf !== 'object') return null;
  return request.headers.get('cf-connecting-ip');
}
