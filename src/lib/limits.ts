import type { NextRequest } from 'next/server';
import { getClientIP } from './clientIp';
import { getLlmMode, getCommunityBudgetStatus } from './llm';
import type { LlmMode } from './llm';
import { checkRateLimit, incrementRateLimit, DAILY_LIMIT } from './ratelimit';
import type { RateLimitResult } from './ratelimit';
import { nextResetISO } from './budget';
import type { BudgetStatus } from './budget';

// The single limit authority. It does NOT own any limiting logic or Redis client;
// it composes the two existing axes — the global USD community pool (src/lib/budget.ts)
// and the per-IP daily rate limiter (src/lib/ratelimit.ts) — into one decision with
// ONE reset-time source per blocking reason. Fail-open is inherited from both
// underlying functions: when Redis is unavailable the budget reports not-exhausted
// and the limiter reports success, so the request is allowed.

export type LimitReason = 'community-budget' | 'ip-rate' | null;

export interface UnifiedLimitStatus {
  allowed: boolean;
  reason: LimitReason; // which gate is blocking (budget checked first), or null
  resetAt: string; // ISO reset for the BLOCKING reason, else the budget reset
  isAdmin: boolean;
  budget: {
    limitUsd: number;
    spentUsd: number;
    remainingUsd: number;
    exhausted: boolean;
    resetAt: string; // === nextResetISO()
  } | null; // null for admins (no community pool)
  ipRate: {
    limit: number; // DAILY_LIMIT
    remaining: number;
    exhausted: boolean;
    resetAt: string; // ISO derived from RateLimitResult.reset (epoch ms → ISO)
  };
}

const msToISO = (ms: number) => new Date(ms).toISOString();

// READ-ONLY evaluation (no increment). Used both to gate a request and to power
// /api/usage. Budget is the GLOBAL gate and is checked first; per-IP is the
// per-user gate. A globally-exhausted pool reports 'community-budget' even if the
// user is also under their per-IP cap, matching "the USD budget controls ALL users".
export async function evaluateLimits(request: NextRequest): Promise<UnifiedLimitStatus> {
  const mode: LlmMode = getLlmMode(request);
  const isAdmin = mode === 'admin';

  const budgetStatus: BudgetStatus | null = await getCommunityBudgetStatus(mode);
  const ip = getClientIP(request);
  const ipResult: RateLimitResult = await checkRateLimit(ip);

  const budget = budgetStatus
    ? {
        limitUsd: budgetStatus.limitUsd,
        spentUsd: budgetStatus.spentUsd,
        remainingUsd: budgetStatus.remainingUsd,
        exhausted: budgetStatus.exhausted,
        resetAt: budgetStatus.resetAt, // === nextResetISO()
      }
    : null;

  const ipRate = {
    limit: DAILY_LIMIT,
    remaining: ipResult.remaining,
    exhausted: !ipResult.success,
    resetAt: msToISO(ipResult.reset),
  };

  const budgetExhausted = budget?.exhausted ?? false;

  let reason: LimitReason = null;
  let resetAt = budget?.resetAt ?? nextResetISO();
  if (budgetExhausted) {
    reason = 'community-budget';
    resetAt = budget!.resetAt;
  } else if (ipRate.exhausted) {
    reason = 'ip-rate';
    resetAt = ipRate.resetAt;
  }

  return { allowed: reason === null, reason, resetAt, isAdmin, budget, ipRate };
}

// Charges the per-IP counter (call once per accepted request, mirroring parse's
// existing incrementRateLimit). Returns the post-increment per-IP view so callers
// can set fresh X-RateLimit-* headers.
export async function chargeIpRate(request: NextRequest): Promise<RateLimitResult> {
  return incrementRateLimit(getClientIP(request));
}
