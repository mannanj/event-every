import { NextRequest, NextResponse } from 'next/server';
import { getBudgetStatus } from '@/lib/budget';
import { getLlmMode } from '@/lib/llm';

const round = (value: number) => Math.round(value * 10000) / 10000;

export async function GET(request: NextRequest) {
  const isAdmin = getLlmMode(request) === 'admin';
  const status = await getBudgetStatus();

  return NextResponse.json(
    {
      ...status,
      spentUsd: round(status.spentUsd),
      remainingUsd: round(status.remainingUsd),
      isAdmin,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
