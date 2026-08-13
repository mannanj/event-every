'use client';

import { useEffect, useState } from 'react';
import OwnerBudgetScreen, { type OwnerBudgetScreenState } from './OwnerBudgetScreen';

type BoundaryState = 'checking' | 'available' | OwnerBudgetScreenState;
export type OwnerBudgetAccess = Readonly<{
  processingDisabled: boolean;
  state: 'available' | OwnerBudgetScreenState;
}>;

const BUDGET_CHECK_TIMEOUT_MS = 3_000;

function classifyUsage(value: unknown): BoundaryState {
  if (!value || typeof value !== 'object') return 'unavailable';
  const usage = value as { status?: unknown; exhausted?: unknown; frozen?: unknown };
  if (usage.status !== 'available') return 'unavailable';
  if (usage.frozen === true) return 'frozen';
  if (usage.exhausted === true) return 'exhausted';
  return usage.frozen === false && usage.exhausted === false ? 'available' : 'unavailable';
}

async function loadBudgetState(signal: AbortSignal): Promise<BoundaryState> {
  const request = fetch('/api/usage', { cache: 'no-store', signal })
    .then(async (response) => response.ok ? classifyUsage(await response.json()) : 'unavailable')
    .catch((): BoundaryState => 'unavailable');
  let timeoutHandle: number | undefined;
  const timeout = new Promise<BoundaryState>((resolve) => {
    timeoutHandle = window.setTimeout(() => resolve('unavailable'), BUDGET_CHECK_TIMEOUT_MS);
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
  const [state, setState] = useState<BoundaryState>('checking');
  const [viewEvents, setViewEvents] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void loadBudgetState(controller.signal)
      .then((next) => {
        if (active) setState(next);
      })
      .finally(() => controller.abort());
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  if (state === 'checking') {
    return <div className="min-h-screen" aria-busy="true" data-testid="owner-budget-checking" />;
  }
  if (state === 'available') {
    return children({ processingDisabled: false, state });
  }
  return viewEvents
    ? children({ processingDisabled: true, state })
    : <OwnerBudgetScreen state={state} onViewEvents={() => setViewEvents(true)} />;
}
