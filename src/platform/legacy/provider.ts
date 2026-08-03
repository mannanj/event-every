import type { NextRequest, NextResponse } from 'next/server';
import { ProviderAdapterError } from '@event-every/scanner/openrouter';
import { DAILY_LIMIT } from '@/lib/ratelimit';
import { nextResetISO } from '@/lib/budget';
import { chargeIpRate, evaluateLimits, type UnifiedLimitStatus } from '@/lib/limits';
import {
  CommunityLimitError,
  OpenRouterUpstreamError,
  communityLimitResponse,
  getLlmKey,
  getLlmMode,
  openRouterChat,
  type LlmCallAuth,
  type OpenRouterChatOptions,
  type OpenRouterResponse,
} from '@/lib/llm';
import type { LegacyChargeResult, LegacyProviderPort, LegacyProviderResult } from '@/platform/contracts';
import { startLegacyDispatch } from '@/platform/legacy/dispatch';

type FailureDetail =
  | Readonly<{ kind: 'community-limit'; resetAt: string }>
  | Readonly<{ kind: 'privacy-endpoint-unavailable' }>
  | Readonly<{ kind: 'upstream-unavailable' }>;

export type LegacyProviderRequest = Readonly<{
  evaluateLimits(): Promise<UnifiedLimitStatus>;
  auth(): LlmCallAuth;
  charge(): Promise<LegacyChargeResult>;
  run<T>(operation: () => Promise<T>): Promise<LegacyProviderResult<T>>;
  chat(options: OpenRouterChatOptions): Promise<LegacyProviderResult<OpenRouterResponse>>;
  failure(): FailureDetail | undefined;
}>;

export const legacyProviderPort: LegacyProviderPort = { dispatch: startLegacyDispatch };

export function bindLegacyProviderRequest(request: NextRequest): LegacyProviderRequest {
  let selectedAuth: LlmCallAuth | undefined;
  let failure: FailureDetail | undefined;

  function auth(): LlmCallAuth {
    if (!selectedAuth) {
      const mode = getLlmMode(request);
      selectedAuth = { key: getLlmKey(mode), mode };
    }
    return selectedAuth;
  }

  async function run<T>(operation: () => Promise<T>): Promise<LegacyProviderResult<T>> {
    try {
      return { status: 'success', value: await operation() };
    } catch (error) {
      const mode = auth().mode;
      if (error instanceof CommunityLimitError || (error instanceof ProviderAdapterError && mode === 'community' && error.status === 402)) {
        failure = { kind: 'community-limit', resetAt: error instanceof CommunityLimitError ? error.resetAt : nextResetISO() };
        return { status: 'failed', code: 'community_limit' };
      }
      if ((error instanceof ProviderAdapterError || error instanceof OpenRouterUpstreamError) && error.status === 408) {
        failure = { kind: 'upstream-unavailable' };
        return { status: 'failed', code: 'upstream_timeout' };
      }
      if (error instanceof ProviderAdapterError && error.code === 'privacy_endpoint_unavailable') {
        failure = { kind: 'privacy-endpoint-unavailable' };
      } else {
        failure = { kind: 'upstream-unavailable' };
      }
      return { status: 'failed', code: 'upstream_unavailable' };
    }
  }

  return {
    evaluateLimits: () => evaluateLimits(request),
    auth,
    async charge() {
      try {
        await chargeIpRate(request);
        return { status: 'charged' };
      } catch {
        return { status: 'unavailable', code: 'legacy_charge_rejected' };
      }
    },
    run,
    chat: (options) => run(() => openRouterChat(options, auth())),
    failure: () => failure,
  };
}

export function legacyCommunityLimitResponse(resetAt: string): NextResponse {
  return communityLimitResponse(new CommunityLimitError(resetAt));
}

export function legacyIpLimitResponse(resetAt: string): NextResponse {
  return Response.json(
    { error: 'Daily request limit reached', reset: resetAt },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': DAILY_LIMIT.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': Date.parse(resetAt).toString(),
      },
    },
  ) as NextResponse;
}
