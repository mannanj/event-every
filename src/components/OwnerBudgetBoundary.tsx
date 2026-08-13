'use client';

import { useEffect, useState } from 'react';
import OwnerBudgetScreen, { type OwnerBudgetScreenState } from './OwnerBudgetScreen';

type BoundaryState = 'checking' | 'available' | OwnerBudgetScreenState;

function classifyUsage(value: unknown): BoundaryState {
  if (!value || typeof value !== 'object') return 'unavailable';
  const usage = value as { status?: unknown; exhausted?: unknown; frozen?: unknown };
  if (usage.status !== 'available') return 'unavailable';
  if (usage.frozen === true) return 'frozen';
  if (usage.exhausted === true) return 'exhausted';
  return usage.frozen === false && usage.exhausted === false ? 'available' : 'unavailable';
}

export default function OwnerBudgetBoundary({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BoundaryState>('checking');

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/usage', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => response.ok ? classifyUsage(await response.json()) : 'unavailable')
      .then((next) => setState(next))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setState('unavailable');
      });
    return () => controller.abort();
  }, []);

  if (state === 'checking') {
    return <div className="min-h-screen" aria-busy="true" data-testid="owner-budget-checking" />;
  }
  return state === 'available' ? children : <OwnerBudgetScreen state={state} />;
}
