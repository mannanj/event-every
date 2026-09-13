import { NextResponse } from 'next/server';

import { createLoginToken, normaliseEmail } from '@/server/accounts/auth';
import { getEmailSender, signInEmail } from '@/server/accounts/email';
import { accountsDb, accountsEnv, appOrigin } from '@/server/accounts/env';
import { SIGN_IN_LIMITS, bucketKey, spend } from '@/server/accounts/rate-limit';
import { clientHandle, verifyTurnstile } from '@/server/accounts/turnstile';
import type { D1Like } from '@/server/accounts/d1';

export const dynamic = 'force-dynamic';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status: number, extra: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...extra },
  });
}

/**
 * Send a sign-in link.
 *
 * TWO THINGS THIS ROUTE IS CAREFUL ABOUT.
 *
 * First, it answers the same way whether or not the address has an account.
 * Whether somebody is registered here is not a fact to hand out to anyone who
 * can type an address into a form.
 *
 * Second, Turnstile is verified BEFORE a token is minted or any mail is sent.
 * Checking afterwards would still let a scripted post make this domain send
 * mail, which is the abuse that matters: the attacker does not need the
 * response, they need eventevery.com sending to someone else's inbox.
 */
export async function POST(request: Request) {
  const env = accountsEnv();
  let db: D1Like;
  try {
    db = accountsDb(env);
  } catch {
    return json({ error: 'Accounts are not available.' }, 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  const fields = body as { email?: unknown; turnstileToken?: unknown };
  const email = typeof fields.email === 'string' ? fields.email.trim() : '';
  if (!email || email.length > 200 || !EMAIL_PATTERN.test(email)) {
    return json({ error: 'Type an email address, like you@example.com.' }, 400);
  }

  const handle = clientHandle(request);

  // Only enforced when a secret is configured. A deployment without Turnstile
  // still rate limits, rather than refusing every sign-in with a bot-check
  // error nobody can act on.
  if (env.TURNSTILE_SECRET) {
    const human = await verifyTurnstile({
      secret: env.TURNSTILE_SECRET,
      token: fields.turnstileToken,
      remoteIp: null,
    });
    if (!human) {
      return json({ error: 'That bot check did not pass. Reload the page and try again.' }, 403);
    }
  }

  // Limited AFTER the bot check, so a flood of scripted requests cannot exhaust
  // a real person's allowance on their way to being refused anyway.
  //
  // Two buckets. The address one protects a third party — it is what stops this
  // app being used to mailbomb somebody who never signed up. The IP one stops a
  // single source working through a list of addresses, which the address bucket
  // cannot see.
  let byEmail;
  let byIp;
  try {
    byEmail = await spend(
      db,
      await bucketKey('email', normaliseEmail(email), env.RATE_LIMIT_HASH_SECRET),
      SIGN_IN_LIMITS.perEmail,
    );
    byIp = handle
      ? await spend(db, await bucketKey('ip', handle, env.RATE_LIMIT_HASH_SECRET), SIGN_IN_LIMITS.perIp)
      : null;
  } catch {
    // bucketKey refuses without a secret. Failing closed is the only safe
    // answer: sending mail with no limit is the abuse this endpoint exists to
    // prevent.
    console.error('rate limit unavailable; refusing to send');
    return json({ error: 'We could not send that email. Try again in a moment.' }, 503);
  }

  if (!byEmail.allowed || (byIp && !byIp.allowed)) {
    const retryAfter = Math.max(byEmail.retryAfter, byIp?.retryAfter ?? 0);
    // The message does not say which bucket ran out: that would tell someone
    // probing whether an address is being limited separately from their own.
    return json(
      { error: 'Too many sign-in links requested. Try again in a few minutes.' },
      429,
      { 'Retry-After': String(retryAfter) },
    );
  }

  const token = await createLoginToken(db, email);
  const url = new URL('/api/auth/redeem', appOrigin(request, env));
  url.searchParams.set('token', token);

  // Awaited, not deferred. Someone is watching this form for the word "sent",
  // and telling them it was sent when the send threw is the kind of lie that
  // takes a day to track down.
  try {
    await getEmailSender(env).send(signInEmail({ to: email, url: url.toString() }));
  } catch (error) {
    // The most common cause by far is a `from` domain that is not onboarded to
    // Email Sending.
    console.error('sign-in email failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'We could not send that email. Try again in a moment.' }, 502);
  }

  return json({ sent: true }, 200);
}
