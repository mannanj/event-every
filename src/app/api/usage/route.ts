import { NextRequest, NextResponse } from 'next/server';
import { bindLegacyUsageRequest } from '@/platform/legacy';
import { getUsagePort } from '@/platform/runtime';

const round = (value: number) => Math.round(value * 10000) / 10000;

export async function GET(request: NextRequest) {
  const selectedPort = getUsagePort();
  if ('status' in selectedPort) {
    return NextResponse.json({ error: 'State is not ready.', code: 'c1_state_not_ready' }, { status: 503 });
  }

  const port = bindLegacyUsageRequest(selectedPort, request);
  const result = await port.read({ identity: { kind: 'unknown', keyVersion: '', hmac: '' } });
  if (result.status !== 'available') {
    return NextResponse.json({ error: 'Usage unavailable.' }, { status: 503 });
  }
  const limits = result.value;
  const budget = limits.budget;

  return NextResponse.json(
    {
      isAdmin: limits.isAdmin,
      exhausted: budget?.exhausted ?? false,
      resetAt: limits.resetAt,
      limitUsd: budget?.limitUsd ?? 0,
      spentUsd: round(budget?.spentUsd ?? 0),
      remainingUsd: round(budget?.remainingUsd ?? 0),
      allowed: limits.allowed,
      reason: limits.reason,
      budget: budget ? { ...budget, spentUsd: round(budget.spentUsd), remainingUsd: round(budget.remainingUsd) } : null,
      ipRate: limits.ipRate,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
