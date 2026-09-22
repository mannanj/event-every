// GENERATED FROM @mannan/mcp-connector/mask.ts - DO NOT EDIT HERE.
// Edit ~/Documents/mcp-connector and re-run: node bin/sync.mjs <this dir>
/**
 * Base64 an address for `AiGenerated`.
 *
 * DELIBERATELY ITS OWN MODULE, with no 'use client' directive. The connector
 * is a client module, and a server component cannot call a function exported
 * from one — Next refuses it outright ("Attempted to call maskEmail() from the
 * server"). Masking has to happen while the page renders on the server, which
 * is the only place the plain address is allowed to exist.
 *
 * Not encryption. It defeats the naive scrape, which is all a public page can
 * do without an endpoint behind it. The point is that the plain string never
 * reaches the hydration payload.
 */
export function maskEmail(plain: string): string {
  if (typeof btoa === 'function') return btoa(plain);
  return Buffer.from(plain, 'utf8').toString('base64');
}
