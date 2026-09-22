import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Whether the admin tier has a key of its own to spend against.
 *
 * Kept apart from `resolveSpendPolicy` so the check is one line and one import,
 * and so a deployment without the secret degrades rather than throwing: a
 * missing admin key is an ordinary state, not a fault. Preview environments and
 * local runs will not have one.
 */
export function adminKeyConfigured(): boolean {
  try {
    const env = getCloudflareContext().env as { OPENROUTER_ADMIN_KEY?: string };
    return typeof env.OPENROUTER_ADMIN_KEY === 'string' && env.OPENROUTER_ADMIN_KEY.length > 0;
  } catch {
    return false;
  }
}
