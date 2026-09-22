export type RoutePolicy = Readonly<{ method: 'GET' | 'POST'; maxBodyBytes: number; allow: string; retired?: boolean }>;
const MiB = 1024 * 1024;
const policy = (method: RoutePolicy['method'], maxBodyBytes: number, retired = false): RoutePolicy => ({ method, maxBodyBytes, allow: method, ...(retired ? { retired } : {}) });
const SCRAPE_URL_POLICY = policy('POST', 4 * 1024);
export const ROUTE_MANIFEST: Readonly<Record<string, RoutePolicy>> = {
  '/api/auth/check': policy('GET', 0), '/api/auth/logout': policy('POST', 0), '/api/auth/verify': policy('POST', 2 * 1024, true),
  '/api/detect-urls': policy('POST', 128 * 1024), '/api/keep-alive': policy('GET', 0, true), '/api/provider-status': policy('POST', 1024),
  '/api/resolve-timezone': policy('POST', 16 * 1024), '/api/scan': policy('POST', 12 * MiB), '/api/scrape-url': SCRAPE_URL_POLICY,
  '/api/summarize': policy('POST', 16 * 1024), '/api/triage': policy('POST', 20 * 1024), '/api/usage': policy('GET', 0), '/api/waitlist': policy('POST', 4 * 1024, true),
  // Accounts. `challenge` asks for a sign-in link; `redeem` spends one. Both
  // names were reserved ahead of the implementation — redeem is a GET because
  // what spends the link is a person clicking it in their mail client, which is
  // a navigation, not a form post.
  '/api/auth/challenge': policy('POST', 8 * 1024), '/api/auth/redeem': policy('GET', 0),
  // Whether the sign-in bot check is on, and the sitekey to render it with.
  // Served at runtime rather than inlined as a NEXT_PUBLIC_ constant, which is
  // baked at build time and empty when the key lives on the deployed Worker.
  '/api/auth/config': policy('GET', 0),
  // Encrypted event sync. Split by method because a policy pins exactly one.
  '/api/sync/pull': policy('GET', 0), '/api/sync/push': policy('POST', 4 * MiB),
  // The MCP bridge. `authorize` is a browser navigation carrying an opaque
  // state; the rest are called by the MCP Worker with a signed actor token, so
  // they arrive with no Origin header and no cookie.
  //
  // Split by verb in the PATH rather than by method, because a policy admits
  // GET or POST and nothing else.
  '/api/mcp/authorize': policy('GET', 0),
  '/api/mcp/events': policy('GET', 0),
  '/api/mcp/events/save': policy('POST', 64 * 1024),
  '/api/mcp/events/remove': policy('POST', 1024),
  // 16MiB because an image arrives here as base64, which costs a third on top
  // of the scanner's own 8MiB ceiling. /api/scan admits 12MiB for the same
  // reason; this is that plus the .ics and page-text cases.
  '/api/mcp/scan': policy('POST', 16 * MiB),
  // Two jobs, one path: the MCP Worker mints an upload link with an actor
  // token, and the person's browser redeems it with the photo. The ceiling is
  // the redeem half, which carries an image as base64.
  '/api/mcp/handoff': policy('POST', 16 * MiB),
  // Attachment backup. `file` returns bytes rather than JSON, which is why it
  // is a GET with no body: the admission policy pins the media type of what
  // comes IN, and nothing comes in here. `upload` carries base64 in JSON, so
  // its ceiling is the ten files it admits at six megabytes each, plus the
  // third that base64 adds.
  '/api/attachments': policy('GET', 0),
  '/api/attachments/settings': policy('POST', 1024),
  '/api/attachments/upload': policy('POST', 84 * MiB),
  '/api/attachments/file': policy('GET', 0),
  '/api/attachments/remove': policy('POST', 32 * 1024),
};

/**
 * Nothing is reserved now that `challenge` and `redeem` are real routes. Kept
 * as an empty manifest rather than deleted: admission still consults it, and a
 * future route can be closed off here before it is built.
 */
export const RESERVED_ROUTE_MANIFEST: Readonly<Record<string, RoutePolicy>> = {};
