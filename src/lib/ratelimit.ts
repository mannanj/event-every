import { kv } from '@vercel/kv';

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
  error?: string;
}

const DAILY_LIMIT = 5;
const WINDOW_DURATION = 24 * 60 * 60; // 24 hours in seconds

export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  try {
    const key = `ratelimit:events:${identifier}`;
    const now = Date.now();
    const windowStart = now - (WINDOW_DURATION * 1000);

    const count = await kv.get<number>(key);
    const currentCount = count || 0;

    if (currentCount >= DAILY_LIMIT) {
      const ttl = await kv.ttl(key);
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
  try {
    const key = `ratelimit:events:${identifier}`;

    const current = await kv.get<number>(key);
    const newCount = (current || 0) + 1;

    await kv.set(key, newCount, { ex: WINDOW_DURATION });

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
