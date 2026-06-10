// Cloudflare D1 over the REST API. Cloudflare recommends this path for
// low-volume/administrative workloads, which waitlist signups are; the global
// API limit (1,200 req / 5 min) is orders of magnitude above our traffic.

export interface D1QueryResult<T> {
  results: T[];
  meta?: { changes?: number; [key: string]: unknown };
}

interface D1ApiResponse<T> {
  success: boolean;
  errors?: Array<{ message?: string }>;
  result?: Array<{ results?: T[]; meta?: D1QueryResult<T>['meta'] }>;
}

export function isD1Configured(): boolean {
  return !!(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
    process.env.CLOUDFLARE_D1_DATABASE_ID &&
    process.env.CLOUDFLARE_D1_API_TOKEN
  );
}

export async function d1Query<T = Record<string, unknown>>(
  sql: string,
  params: Array<string | number | null> = []
): Promise<D1QueryResult<T>> {
  if (!isD1Configured()) throw new Error('D1 is not configured');

  const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${process.env.CLOUDFLARE_D1_DATABASE_ID}/query`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_D1_API_TOKEN}`,
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
