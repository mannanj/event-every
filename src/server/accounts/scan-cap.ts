import { ADMIN_POLICY_VERSION, type SpendPolicyVersion } from '@/platform/provider/policy';
import { accountsConfigured, accountsDb, accountsEnv } from '@/server/accounts/env';
import { SCAN_LIMITS, bucketKey, spend } from '@/server/accounts/rate-limit';

/**
 * How much of the shared day one person may take.
 *
 * TWO LIMITS, TWO QUESTIONS. The budget ledger answers "has this app spent too
 * much today" - it is a ceiling on money, and it is what OpenRouter's own limit
 * is matched to. This answers "has one person taken too much of what the app
 * can spend", which is a fairness rule and not a spending limit. A single
 * number cannot answer both: set it low enough to be fair and the app stops
 * before its budget does; set it high enough to use the budget and one visitor
 * can still take all of it.
 *
 * The gap mattered. Task 201 recorded a day where a handful of FAILED calls
 * burned 97% of the budget at the full reservation and left the whole site
 * view-only. Nothing stopped one source doing that.
 *
 * THE ADMIN TIER IS EXEMPT, because it is not sharing. It has its own ledger
 * and its own key, so there is nobody for it to be unfair to - which is the
 * whole point of having given it one.
 *
 * FAILING OPEN IS DELIBERATE HERE, and it is the opposite of the sign-in
 * limiter's stance. There, refusing to count means refusing to send mail,
 * because the thing being protected is somebody else's inbox. Here the budget
 * ledger is still underneath and still says no about money, so a counter that
 * cannot be read should not take the app away from everybody.
 */
export type ScanCapVerdict =
  | { allowed: true }
  | { allowed: false; retryAfter: number };

export async function chargeScanCap(
  identity: string,
  policyVersion: SpendPolicyVersion,
): Promise<ScanCapVerdict> {
  // Its own ledger, its own key, nobody to be unfair to.
  if (policyVersion === ADMIN_POLICY_VERSION) return { allowed: true };

  try {
    const env = accountsEnv();
    if (!accountsConfigured(env) || !env.RATE_LIMIT_HASH_SECRET) return { allowed: true };

    const verdict = await spend(
      accountsDb(env),
      await bucketKey('scan', identity, env.RATE_LIMIT_HASH_SECRET),
      SCAN_LIMITS.perIdentity,
    );
    return verdict.allowed ? { allowed: true } : { allowed: false, retryAfter: verdict.retryAfter };
  } catch {
    // See above: the money ceiling is still in force.
    return { allowed: true };
  }
}
