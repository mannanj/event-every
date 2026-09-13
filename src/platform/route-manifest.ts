export type RoutePolicy = Readonly<{ method: 'GET' | 'POST'; maxBodyBytes: number; allow: string; retired?: boolean }>;
const MiB = 1024 * 1024;
const policy = (method: RoutePolicy['method'], maxBodyBytes: number, retired = false): RoutePolicy => ({ method, maxBodyBytes, allow: method, ...(retired ? { retired } : {}) });
const SCRAPE_URL_POLICY = policy('POST', 4 * 1024);
export const ROUTE_MANIFEST: Readonly<Record<string, RoutePolicy>> = {
  '/api/auth/check': policy('GET', 0), '/api/auth/logout': policy('POST', 0), '/api/auth/verify': policy('POST', 2 * 1024, true),
  '/api/detect-urls': policy('POST', 128 * 1024), '/api/keep-alive': policy('GET', 0, true), '/api/provider-status': policy('POST', 1024),
  '/api/resolve-timezone': policy('POST', 16 * 1024), '/api/scan': policy('POST', 12 * MiB), '/api/scrape-url': SCRAPE_URL_POLICY,
  '/api/summarize': policy('POST', 16 * 1024), '/api/usage': policy('GET', 0), '/api/waitlist': policy('POST', 4 * 1024, true),
  // Accounts. `challenge` asks for a sign-in link; `redeem` spends one. Both
  // names were reserved ahead of the implementation — redeem is a GET because
  // what spends the link is a person clicking it in their mail client, which is
  // a navigation, not a form post.
  '/api/auth/challenge': policy('POST', 8 * 1024), '/api/auth/redeem': policy('GET', 0),
  // Encrypted event sync. Split by method because a policy pins exactly one.
  '/api/sync/pull': policy('GET', 0), '/api/sync/push': policy('POST', 4 * MiB),
};

/**
 * Nothing is reserved now that `challenge` and `redeem` are real routes. Kept
 * as an empty manifest rather than deleted: admission still consults it, and a
 * future route can be closed off here before it is built.
 */
export const RESERVED_ROUTE_MANIFEST: Readonly<Record<string, RoutePolicy>> = {};
