export const COMMUNITY_LIMIT_CODE = 'community_limit';
export const COMMUNITY_LIMIT_EVENT = 'summon:community-limit';

export interface CommunityLimitDetail {
  resetAt?: string;
}

export function emitCommunityLimit(resetAt?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<CommunityLimitDetail>(COMMUNITY_LIMIT_EVENT, { detail: { resetAt } })
  );
}

// Detects a community-limit 402 from any API route and flips the app to the
// limit screen (AuthWrapper listens). Returns true when it was the limit.
export async function emitIfCommunityLimited(response: Response): Promise<boolean> {
  if (response.status !== 402) return false;
  try {
    const data = await response.clone().json();
    if (data?.code === COMMUNITY_LIMIT_CODE) {
      emitCommunityLimit(typeof data.resetAt === 'string' ? data.resetAt : undefined);
      return true;
    }
  } catch {
    // non-JSON 402 — not ours
  }
  return false;
}
