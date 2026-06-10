import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, verifyAuthToken } from '@/app/api/auth/shared';
import { getBudgetStatus, nextResetISO, recordCommunitySpend } from './budget';

export type LlmMode = 'admin' | 'community';

export const COMMUNITY_LIMIT_CODE = 'community_limit';
export const COMMUNITY_LIMIT_MESSAGE =
  'This app is community sponsored. The usage limits have been hit today.';

// The pattern-lock cookie doubles as the admin signal: admins use the
// unrestricted OpenRouter key and bypass the community budget entirely.
export function getLlmMode(request: NextRequest): LlmMode {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  return token && verifyAuthToken(token) ? 'admin' : 'community';
}

export function getLlmKey(mode: LlmMode): string {
  const adminKey = process.env.OPENROUTER_API_KEY || '';
  if (mode === 'admin') return adminKey;
  return process.env.OPENROUTER_COMMUNITY_KEY || adminKey;
}

export class CommunityLimitError extends Error {
  readonly code = COMMUNITY_LIMIT_CODE;

  constructor(public readonly resetAt: string) {
    super(COMMUNITY_LIMIT_MESSAGE);
    this.name = 'CommunityLimitError';
  }
}

export async function ensureCommunityBudget(mode: LlmMode): Promise<void> {
  if (mode === 'admin') return;
  const status = await getBudgetStatus();
  if (status.exhausted) throw new CommunityLimitError(status.resetAt);
}

// OpenRouter returns 402 when the key/account is out of credits — for the
// community key that is the same condition as the tracked budget running out.
export function upstreamCommunityLimit(mode: LlmMode, status: number): CommunityLimitError | null {
  return mode === 'community' && status === 402 ? new CommunityLimitError(nextResetISO()) : null;
}

export function communityLimitResponse(error: CommunityLimitError): NextResponse {
  return NextResponse.json(
    { error: error.message, code: COMMUNITY_LIMIT_CODE, resetAt: error.resetAt },
    { status: 402 }
  );
}

// usage.cost (USD) is included automatically in every OpenRouter response.
export async function recordLlmUsage(mode: LlmMode, usage?: { cost?: number }): Promise<void> {
  if (mode !== 'community') return;
  await recordCommunitySpend(typeof usage?.cost === 'number' ? usage.cost : 0);
}
