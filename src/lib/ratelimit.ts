import { Redis } from '@upstash/redis';

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
  error?: string;
}

export const DAILY_LIMIT = 1000;
const WINDOW_DURATION = 24 * 60 * 60; // 24 hours in seconds

const isRedisAvailable = () => {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
};

const getRedis = () =>
  new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  if (!isRedisAvailable()) {
    return {
      success: true,
      remaining: DAILY_LIMIT,
      reset: Date.now() + (WINDOW_DURATION * 1000)
    };
  }

  try {
    const redis = getRedis();
    const key = `ratelimit:events:${identifier}`;
    const now = Date.now();

    const count = await redis.get<number>(key);
    const currentCount = count || 0;

    if (currentCount >= DAILY_LIMIT) {
      const ttl = await redis.ttl(key);
      const resetTime = now + (ttl * 1000);

      return {
        success: false,
        remaining: 0,
        reset: resetTime,
        error: 'Daily limit exceeded'
      };
    }

    return {
      success: true,
      remaining: DAILY_LIMIT - currentCount,
      reset: now + (WINDOW_DURATION * 1000)
    };
  } catch (error) {
    console.error('Rate limit check error:', error);
    return {
      success: true,
      remaining: DAILY_LIMIT,
      reset: Date.now() + (WINDOW_DURATION * 1000)
    };
  }
}

export async function incrementRateLimit(identifier: string): Promise<RateLimitResult> {
  if (!isRedisAvailable()) {
    return {
      success: true,
      remaining: DAILY_LIMIT - 1,
      reset: Date.now() + (WINDOW_DURATION * 1000)
    };
  }

  try {
    const redis = getRedis();
    const key = `ratelimit:events:${identifier}`;

    const current = await redis.get<number>(key);
    const newCount = (current || 0) + 1;

    await redis.set(key, newCount, { ex: WINDOW_DURATION });

    const remaining = Math.max(0, DAILY_LIMIT - newCount);
    const reset = Date.now() + (WINDOW_DURATION * 1000);

    return {
      success: newCount <= DAILY_LIMIT,
      remaining,
      reset
    };
  } catch (error) {
    console.error('Rate limit increment error:', error);
    return {
      success: true,
      remaining: DAILY_LIMIT - 1,
      reset: Date.now() + (WINDOW_DURATION * 1000)
    };
  }
}
