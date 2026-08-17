import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPlatformRuntime } from '@/platform/runtime';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const amount = z.number().int().safe().nonnegative();
const UsageResponseSchema = z.object({
  status: z.literal('available'),
  policyVersion: z.literal('owner-v1'),
  authorityDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limitNanodollars: amount,
  spentNanodollars: amount,
  reservedNanodollars: amount,
  remainingNanodollars: amount,
  exhausted: z.boolean(),
  frozen: z.boolean(),
  resetAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  const remaining = Math.max(0, value.limitNanodollars - value.spentNanodollars - value.reservedNanodollars);
  if (value.remainingNanodollars !== remaining) context.addIssue({ code: 'custom', message: 'invalid remaining amount' });
  if (value.exhausted !== (value.frozen || remaining < 500_000)) context.addIssue({ code: 'custom', message: 'invalid exhaustion state' });
});

export async function GET(_request: NextRequest): Promise<Response> {
  const authorityDay = new Date().toISOString().slice(0, 10);
  const result = await getPlatformRuntime().ownerBudgetStatus(authorityDay);
  const parsed = UsageResponseSchema.safeParse(result);
  if (!parsed.success || parsed.data.authorityDay !== authorityDay) {
    return NextResponse.json(
      { error: 'Owner budget unavailable.', code: 'owner_budget_unavailable' },
      { status: 503, headers: NO_STORE },
    );
  }
  return NextResponse.json(parsed.data, { headers: NO_STORE });
}
