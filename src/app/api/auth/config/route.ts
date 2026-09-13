import { accountsEnv } from '@/server/accounts/env';

export const dynamic = 'force-dynamic';

/**
 * Public sign-in configuration, read at RUNTIME.
 *
 * Deliberately not a `NEXT_PUBLIC_` constant. Those are inlined at BUILD time,
 * so a key that lives on the deployed Worker is the empty string in shipped
 * code — and nothing errors: the guard that checks for it quietly does nothing
 * and the widget never renders. A sibling app on this account shipped a contact
 * form in exactly that state for weeks, permanently masked, with no log line.
 *
 * Both halves are reported because either one missing breaks the feature. A
 * sitekey with no secret renders a widget whose token nothing verifies; a
 * secret with no sitekey refuses every request, because the form can never
 * produce a token. `enabled` is their AND — it says the capability is on
 * without revealing what makes it work.
 *
 * `enabled: false` is a supported state, not a failure. The sign-in form then
 * behaves exactly as it did before the check existed, which is what makes this
 * safe to arm in stages — and what makes removing the secret an instant
 * rollback with no deploy.
 */
export async function GET() {
  const env = accountsEnv();
  const sitekey = env.TURNSTILE_SITEKEY?.trim() ?? '';
  const enabled = Boolean(sitekey && env.TURNSTILE_SECRET?.trim());

  return Response.json(
    { turnstile: { enabled, sitekey: enabled ? sitekey : null } },
    { headers: { 'cache-control': 'no-store' } },
  );
}
