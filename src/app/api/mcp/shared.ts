/**
 * The pieces the two halves of the authorize bridge both need.
 *
 * Asking and doing live at different paths because the route manifest admits
 * exactly one method per path - and the split is honest anyway. A GET shows a
 * question; a POST signs a grant. Only one of those is safe to reach with a
 * link somebody was sent.
 */

/** Matches the opaque state the MCP Worker mints. Anything else never came from it. */
export const STATE = /^[A-Za-z0-9_-]{1,128}$/;

export function back(origin: string, path: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: new URL(path, origin).toString(), 'Cache-Control': 'no-store' },
  });
}

/**
 * A token only this session can produce, for this state.
 *
 * HMAC over the session id and the state, under the grant secret. It reaches
 * the browser only inside the consent page's form, never in a link, so a
 * cross-site GET cannot carry it and a cross-site POST cannot guess it. That is
 * what stops somebody being made to connect a stranger's assistant by clicking
 * a URL.
 *
 * Bound to the SESSION as well as the state: a token minted for one person is
 * useless to another, so it cannot be harvested and re-served.
 */
export async function consentToken(
  sessionId: string,
  state: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`consent.v1.${sessionId}.${state}`),
  );
  let binary = '';
  for (const byte of new Uint8Array(mac)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

export function sessionId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === 'ee_session') return decodeURIComponent(rest.join('='));
  }
  return null;
}
