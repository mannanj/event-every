import { NextRequest, NextResponse } from 'next/server';
import { resolveSpendPolicy } from '@/server/accounts/spend-tier';
import { z } from 'zod';
import { getPlatformRuntime } from '@/platform/runtime';
import { ADMIN_POLICY_VERSION, OWNER_POLICY_VERSION } from '@/platform/provider/policy';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const amount = z.number().int().safe().nonnegative();
const UsageResponseSchema = z.object({
  status: z.literal('available'),
  policyVersion: z.enum([OWNER_POLICY_VERSION, ADMIN_POLICY_VERSION]),
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

export async function GET(request: NextRequest): Promise<Response> {
  const authorityDay = new Date().toISOString().slice(0, 10);
  // The caller's own ledger. An admin asking how much is left must be told
  // about the budget they actually spend from, or the app takes itself away
  // from them on a day that never touched it.
  const policyVersion = await resolveSpendPolicy(request);
  const result = await getPlatformRuntime().ownerBudgetStatus(authorityDay, policyVersion);
  const parsed = UsageResponseSchema.safeParse(result);
  // An admin ledger reports `admin-v1` once it has been spent from, and before
  // that reports the default. Either is this caller's own ledger; a ledger
  // stamped with the OTHER tier's version is not, and says unavailable.
  const ownLedger = parsed.success
    && (parsed.data.policyVersion === policyVersion || parsed.data.policyVersion === OWNER_POLICY_VERSION);
  if (!parsed.success || !ownLedger || parsed.data.authorityDay !== authorityDay) {
    return NextResponse.json(
      { error: 'Owner budget unavailable.', code: 'owner_budget_unavailable' },
      { status: 503, headers: NO_STORE },
    );
  }
  return NextResponse.json(parsed.data, { headers: NO_STORE });
}
