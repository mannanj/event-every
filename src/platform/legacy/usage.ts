import type { NextRequest } from 'next/server';
import { evaluateLimits } from '@/lib/limits';
import type { LegacyUsagePort } from '@/platform/contracts';

// The selected runtime port is deliberately request-agnostic. This marker is
// bound to the legacy NextRequest only after the fail-closed runtime gate.
export const legacyUsagePort: LegacyUsagePort = {
  async read() {
    return { status: 'unavailable', code: 'legacy_usage_unavailable' };
  },
};

function createRequestBoundLegacyUsagePort(request: NextRequest): LegacyUsagePort {
  return {
    async read() {
      try {
        const limits = await evaluateLimits(request);
        const budget = limits.budget;
        return {
          status: 'available',
          value: {
            isAdmin: limits.isAdmin,
            exhausted: budget?.exhausted ?? false,
            resetAt: limits.resetAt,
            limitUsd: budget?.limitUsd ?? 0,
            spentUsd: budget?.spentUsd ?? 0,
            remainingUsd: budget?.remainingUsd ?? 0,
            allowed: limits.allowed,
            reason: limits.reason,
            budget,
            ipRate: limits.ipRate,
          },
        };
      } catch {
        return { status: 'unavailable', code: 'legacy_usage_unavailable' };
      }
    },
  };
}

export function bindLegacyUsageRequest(port: LegacyUsagePort, request: NextRequest): LegacyUsagePort {
  return port === legacyUsagePort ? createRequestBoundLegacyUsagePort(request) : port;
}
