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
 * consentToken: an HMAC over the session id and the state, reaching the browser
 * only inside the consent form. constantTimeEqual compares it. Both are shared
 * with every app's bridge - see the vendored consent module.
 */
export { consentToken, constantTimeEqual, grantRedirect } from '@/vendor/mcp-connector/consent';

export function sessionId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === 'ee_session') return decodeURIComponent(rest.join('='));
  }
  return null;
}
