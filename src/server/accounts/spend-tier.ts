import { readSession } from '@/server/accounts/auth';
import { adminKeyConfigured } from '@/server/accounts/spend-key';
import { accountsConfigured, accountsDb, accountsEnv } from '@/server/accounts/env';
import { readCapSubject, shouldEnforceDailyCaps } from '@/server/accounts/admin';
import {
  ADMIN_POLICY_VERSION,
  OWNER_POLICY_VERSION,
  type SpendPolicyVersion,
} from '@/platform/provider/policy';

/**
 * Which budget a request spends from.
 *
 * ONE DECISION, AND IT DECIDES BOTH THINGS. The policy names the ledger and
 * picks the key, and those must move together: an admin ledger paired with the
 * owner's key would permit a second day's worth of spending against a key that
 * has already spent its own, and OpenRouter's 402 would become the thing that
 * says no instead of this app.
 *
 * EVERY FAILURE IS THE OWNER POLICY. No session, no accounts binding, no admin
 * key configured, a database that will not answer - all of them land on the
 * capped, shared budget. An exemption that defaults to "exempt" is not a role,
 * it is a hole, and this is the function where that would happen.
 */
export async function resolveSpendPolicy(request: Request): Promise<SpendPolicyVersion> {
  try {
    const env = accountsEnv();
    if (!accountsConfigured(env)) return OWNER_POLICY_VERSION;

    // No admin key means no admin ledger. Choosing the ledger without the key
    // is the one combination that breaks the ceiling invariant, so the absence
    // of either sends the request back to the owner policy entirely.
    if (!adminKeyConfigured()) return OWNER_POLICY_VERSION;

    const account = await readSession(accountsDb(env), request.headers.get('cookie'));
    if (!account) return OWNER_POLICY_VERSION;

    // Re-derived per request rather than carried on the session, so revoking
    // the flag takes effect on the next call instead of at the next sign-in.
    const subject = await readCapSubject(accountsDb(env), account.id);
    return shouldEnforceDailyCaps(subject) ? OWNER_POLICY_VERSION : ADMIN_POLICY_VERSION;
  } catch {
    return OWNER_POLICY_VERSION;
  }
}
