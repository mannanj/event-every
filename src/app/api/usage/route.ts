import { NextRequest, NextResponse } from 'next/server';
import { evaluateLimits } from '@/lib/limits';

const round = (value: number) => Math.round(value * 10000) / 10000;

export async function GET(request: NextRequest) {
  const limits = await evaluateLimits(request);
  const b = limits.budget;

  return NextResponse.json(
    {
      // Back-compat top-level budget fields (AuthWrapper + /spent read these).
      // `exhausted` reflects ONLY the community-budget state, never the per-IP
      // cap, so a per-user limit never triggers the full-screen takeover.
      isAdmin: limits.isAdmin,
      exhausted: b?.exhausted ?? false,
      resetAt: limits.resetAt,
      limitUsd: b?.limitUsd ?? 0,
      spentUsd: round(b?.spentUsd ?? 0),
      remainingUsd: round(b?.remainingUsd ?? 0),
      // Unified status — both axes from the single authority.
      allowed: limits.allowed,
      reason: limits.reason,
      budget: b ? { ...b, spentUsd: round(b.spentUsd), remainingUsd: round(b.remainingUsd) } : null,
      ipRate: limits.ipRate,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
