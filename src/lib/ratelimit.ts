import { getRedis } from './redisClient';

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
  error?: string;
}

export const DAILY_LIMIT = 1000;

const isRedisAvailable = () => {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
};

// Fixed per-UTC-day window: the key embeds the date so each day self-partitions
// and the limit resets at exactly midnight UTC, matching the community budget
// pool (src/lib/budget.ts). Both functions fail open on Redis errors by design;
// the credit-limited upstream key is the hard backstop (see docs/cost-analysis.md).
const rateLimitKey = (identifier: string) =>
  `ratelimit:events:${identifier}:${new Date().toISOString().slice(0, 10)}`;

// Next UTC midnight as epoch ms — the exact moment today's window resets.
function nextResetMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  if (!isRedisAvailable()) {
    return { success: true, remaining: DAILY_LIMIT, reset: nextResetMs() };
  }

  try {
    const redis = getRedis();
    const count = await redis.get<number>(rateLimitKey(identifier));
    const currentCount = count || 0;

    if (currentCount >= DAILY_LIMIT) {
      return {
        success: false,
        remaining: 0,
        reset: nextResetMs(),
        error: 'Daily limit exceeded',
      };
    }

    return {
      success: true,
      remaining: DAILY_LIMIT - currentCount,
      reset: nextResetMs(),
    };
  } catch (error) {
    console.error('Rate limit check error:', error);
    return { success: true, remaining: DAILY_LIMIT, reset: nextResetMs() };
  }
}

export async function incrementRateLimit(identifier: string): Promise<RateLimitResult> {
  if (!isRedisAvailable()) {
    return { success: true, remaining: DAILY_LIMIT - 1, reset: nextResetMs() };
  }

  try {
    const redis = getRedis();
    const key = rateLimitKey(identifier);

    // Atomic increment; only the request that creates the key (incr → 1) sets the
    // TTL, so the window anchors to first-use that day and never slides forward.
    // 26h comfortably outlives the UTC day the key is scoped to.
    const newCount = await redis.incr(key);
    if (newCount === 1) await redis.expire(key, 26 * 60 * 60);

    return {
      success: newCount <= DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - newCount),
      reset: nextResetMs(),
    };
  } catch (error) {
    console.error('Rate limit increment error:', error);
    return { success: true, remaining: DAILY_LIMIT - 1, reset: nextResetMs() };
  }
}
