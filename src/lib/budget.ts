import { Redis } from '@upstash/redis';

export interface BudgetStatus {
  limitUsd: number;
  spentUsd: number;
  remainingUsd: number;
  exhausted: boolean;
  resetAt: string;
}

// Community pool for anonymous usage, in USD per UTC day.
export const DAILY_BUDGET_USD = (() => {
  const parsed = parseFloat(process.env.DAILY_BUDGET_USD || '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
})();

const isRedisAvailable = () => !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

const getRedis = () =>
  new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });

// One shared pool per UTC day; the key embeds the date so days self-partition
// and the reset moment is exactly midnight UTC.
const budgetKey = () => `budget:community:${new Date().toISOString().slice(0, 10)}`;

export function nextResetISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

export async function getBudgetStatus(): Promise<BudgetStatus> {
  const base = { limitUsd: DAILY_BUDGET_USD, resetAt: nextResetISO() };
  if (!isRedisAvailable()) {
    // Fail open like the event rate limiter; a credit-limited community key
    // on OpenRouter's side is the hard backstop (see docs/cost-analysis.md).
    return { ...base, spentUsd: 0, remainingUsd: DAILY_BUDGET_USD, exhausted: false };
  }

  try {
    const raw = await getRedis().get<number | string>(budgetKey());
    const spent = typeof raw === 'number' ? raw : parseFloat(raw || '0') || 0;
    return {
      ...base,
      spentUsd: spent,
      remainingUsd: Math.max(0, DAILY_BUDGET_USD - spent),
      exhausted: spent >= DAILY_BUDGET_USD,
    };
  } catch (error) {
    console.error('Budget status error:', error);
    return { ...base, spentUsd: 0, remainingUsd: DAILY_BUDGET_USD, exhausted: false };
  }
}

// Records actual cost (OpenRouter usage.cost, USD) against today's pool.
export async function recordCommunitySpend(costUsd: number): Promise<void> {
  if (!Number.isFinite(costUsd) || costUsd <= 0 || !isRedisAvailable()) return;

  try {
    const redis = getRedis();
    const key = budgetKey();
    await redis.incrbyfloat(key, costUsd);
    // 60h TTL comfortably outlives the UTC day the key is scoped to.
    await redis.expire(key, 60 * 60 * 60);
  } catch (error) {
    console.error('Budget record error:', error);
  }
}
