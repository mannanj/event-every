'use client';

import { useEffect, useState } from 'react';
import OwnerBudgetScreen, { type OwnerBudgetScreenState } from './OwnerBudgetScreen';

type LoadedBudgetState =
  | Readonly<{ state: 'available'; resetAt: null }>
  | Readonly<{ state: OwnerBudgetScreenState; resetAt: string | null }>;
type BoundaryState = Readonly<{ state: 'checking'; resetAt: null }> | LoadedBudgetState;
export type OwnerBudgetAccess = Readonly<{
  processingDisabled: boolean;
  state: 'available' | OwnerBudgetScreenState;
}>;

const BUDGET_CHECK_TIMEOUT_MS = 3_000;

const UNAVAILABLE: LoadedBudgetState = { state: 'unavailable', resetAt: null };

function validResetAt(value: unknown): string | null {
  if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) return null;
  return value;
}

function classifyUsage(value: unknown): LoadedBudgetState {
  if (!value || typeof value !== 'object') return UNAVAILABLE;
  const usage = value as { status?: unknown; exhausted?: unknown; frozen?: unknown; resetAt?: unknown };
  if (usage.status !== 'available') return UNAVAILABLE;
  const resetAt = validResetAt(usage.resetAt);
  if (usage.frozen === true) return { state: 'frozen', resetAt };
  if (usage.exhausted === true) return { state: 'exhausted', resetAt };
  return usage.frozen === false && usage.exhausted === false
    ? { state: 'available', resetAt: null }
    : UNAVAILABLE;
}

async function loadBudgetState(signal: AbortSignal): Promise<LoadedBudgetState> {
  const request = fetch('/api/usage', { cache: 'no-store', signal })
    .then(async (response) => response.ok ? classifyUsage(await response.json()) : UNAVAILABLE)
    .catch((): LoadedBudgetState => UNAVAILABLE);
  let timeoutHandle: number | undefined;
  const timeout = new Promise<LoadedBudgetState>((resolve) => {
    timeoutHandle = window.setTimeout(() => resolve(UNAVAILABLE), BUDGET_CHECK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
  }
}

export default function OwnerBudgetBoundary({
  children,
}: {
  children: (access: OwnerBudgetAccess) => React.ReactNode;
}) {
  const [budget, setBudget] = useState<BoundaryState>({ state: 'checking', resetAt: null });
  const [viewEvents, setViewEvents] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void loadBudgetState(controller.signal)
      .then((next) => {
        if (active) setBudget(next);
      })
      .finally(() => controller.abort());
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  if (budget.state === 'checking') {
    return <div className="min-h-screen" aria-busy="true" data-testid="owner-budget-checking" />;
  }
  if (budget.state === 'available') {
    return children({ processingDisabled: false, state: budget.state });
  }
  return viewEvents
    ? children({ processingDisabled: true, state: budget.state })
    : <OwnerBudgetScreen state={budget.state} resetAt={budget.resetAt} onViewEvents={() => setViewEvents(true)} />;
}
