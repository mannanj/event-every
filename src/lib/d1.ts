// Cloudflare D1 access, two interchangeable paths (same response shape):
// 1. Worker proxy (workers/waitlist-d1-proxy) — preferred: the binding is
//    scoped to this one database and needs no account-wide API token.
// 2. Cloudflare REST API with a D1-Edit token — kept as the fallback.

export interface D1QueryResult<T> {
  results: T[];
  meta?: { changes?: number; [key: string]: unknown };
}

interface D1ApiResponse<T> {
  success: boolean;
  errors?: Array<{ message?: string }>;
  result?: Array<{ results?: T[]; meta?: D1QueryResult<T>['meta'] }>;
}

const isProxyConfigured = () =>
  !!(process.env.WAITLIST_D1_PROXY_URL && process.env.WAITLIST_D1_PROXY_SECRET);

const isRestConfigured = () =>
  !!(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
    process.env.CLOUDFLARE_D1_DATABASE_ID &&
    process.env.CLOUDFLARE_D1_API_TOKEN
  );

export function isD1Configured(): boolean {
  return isProxyConfigured() || isRestConfigured();
}

export async function d1Query<T = Record<string, unknown>>(
  sql: string,
  params: Array<string | number | null> = []
): Promise<D1QueryResult<T>> {
  if (!isD1Configured()) throw new Error('D1 is not configured');

  const useProxy = isProxyConfigured();
  const url = useProxy
    ? process.env.WAITLIST_D1_PROXY_URL!
    : `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${process.env.CLOUDFLARE_D1_DATABASE_ID}/query`;
  const bearer = useProxy
    ? process.env.WAITLIST_D1_PROXY_SECRET!
    : process.env.CLOUDFLARE_D1_API_TOKEN!;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(10_000),
  });

  const data = (await response.json()) as D1ApiResponse<T>;
  if (!response.ok || !data.success) {
    throw new Error(data.errors?.[0]?.message || `D1 query failed (${response.status})`);
  }

  return { results: data.result?.[0]?.results ?? [], meta: data.result?.[0]?.meta };
}
