import { readSession } from '@/server/accounts/auth';
import { adminKeyConfigured } from '@/server/accounts/spend-key';
import { accountsConfigured, accountsDb, accountsEnv } from '@/server/accounts/env';
import { readCapSubject, shouldEnforceDailyCaps } from '@/server/accounts/admin';
import { mcpEnv } from '@/server/mcp/env';
import { SCAN_ON_BEHALF_HEADER, verifyScanOnBehalf } from '@/server/mcp/grant';
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
export interface ScanCaller {
  policyVersion: SpendPolicyVersion;
  /** The account the scan is for, or null for a signed-out visitor. */
  accountId: string | null;
}

/**
 * The account behind a request: its session cookie, or - for a scan the MCP
 * routes or the photo handoff make on someone's behalf - the signed
 * on-behalf token. Null when neither verifies.
 */
async function callerAccountId(request: Request, db: ReturnType<typeof accountsDb>): Promise<string | null> {
  const account = await readSession(db, request.headers.get('cookie'));
  if (account) return account.id;

  const token = request.headers.get(SCAN_ON_BEHALF_HEADER);
  const secret = mcpEnv().MCP_GRANT_SECRET;
  if (!token || !secret) return null;
  const onBehalf = await verifyScanOnBehalf(token, secret);
  return onBehalf?.sub ?? null;
}

/**
 * Which budget a request spends from, and whose per-person count it takes.
 *
 * The account is known even when the admin key is not configured, because the
 * per-person cap keys on it either way: a signed-in person is one person
 * whether they scan from a browser, a phone or an assistant.
 */
export async function resolveScanCaller(request: Request): Promise<ScanCaller> {
  try {
    const env = accountsEnv();
    if (!accountsConfigured(env)) return { policyVersion: OWNER_POLICY_VERSION, accountId: null };

    const db = accountsDb(env);
    const accountId = await callerAccountId(request, db);
    if (!accountId) return { policyVersion: OWNER_POLICY_VERSION, accountId: null };

    // No admin key means no admin ledger. Choosing the ledger without the key
    // is the one combination that breaks the ceiling invariant, so the absence
    // of either sends the request back to the owner policy entirely.
    if (!adminKeyConfigured()) return { policyVersion: OWNER_POLICY_VERSION, accountId };

    // Re-derived per request rather than carried on the session or the token,
    // so revoking the flag takes effect on the next call.
    const subject = await readCapSubject(db, accountId);
    return {
      policyVersion: shouldEnforceDailyCaps(subject) ? OWNER_POLICY_VERSION : ADMIN_POLICY_VERSION,
      accountId,
    };
  } catch {
    return { policyVersion: OWNER_POLICY_VERSION, accountId: null };
  }
}

export async function resolveSpendPolicy(request: Request): Promise<SpendPolicyVersion> {
  return (await resolveScanCaller(request)).policyVersion;
}
