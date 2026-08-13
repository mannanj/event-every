export type RoutePolicy = Readonly<{ method: 'GET' | 'POST'; maxBodyBytes: number; allow: string; retired?: boolean }>;
const MiB = 1024 * 1024;
const policy = (method: RoutePolicy['method'], maxBodyBytes: number, retired = false): RoutePolicy => ({ method, maxBodyBytes, allow: method, ...(retired ? { retired } : {}) });
const SCRAPE_URL_POLICY = policy('POST', 4 * 1024);
export const ROUTE_MANIFEST: Readonly<Record<string, RoutePolicy>> = {
  '/api/auth/check': policy('GET', 0), '/api/auth/logout': policy('POST', 0), '/api/auth/verify': policy('POST', 2 * 1024, true),
  '/api/detect-urls': policy('POST', 128 * 1024), '/api/keep-alive': policy('GET', 0, true), '/api/provider-status': policy('POST', 1024),
  '/api/resolve-timezone': policy('POST', 16 * 1024), '/api/scan': policy('POST', 12 * MiB), '/api/scrape-url': SCRAPE_URL_POLICY,
  '/api/summarize': policy('POST', 16 * 1024), '/api/usage': policy('GET', 0), '/api/waitlist': policy('POST', 4 * 1024, true),
};

export const RESERVED_ROUTE_MANIFEST: Readonly<Record<string, RoutePolicy>> = {
  '/api/auth/challenge': policy('POST', 2 * 1024),
  '/api/auth/redeem': policy('POST', 2 * 1024),
};
