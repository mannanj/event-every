import { NextResponse } from 'next/server';

import { readSession } from '@/server/accounts/auth';
import { accountsConfigured, accountsDb, accountsEnv } from '@/server/accounts/env';

export const dynamic = 'force-dynamic';

/**
 * Who this browser is.
 *
 * Was a stub that always answered `{ authenticated: false }` after the pattern
 * lock was retired. It now reads the session for real; the response shape is
 * unchanged so any existing caller keeps working.
 *
 * `accounts` says whether sign-in exists at all in this deployment, so the UI
 * can hide the whole affordance rather than offer a door that opens onto a 503.
 */
export async function GET(request: Request) {
  const env = accountsEnv();
  const headers = { 'Cache-Control': 'no-store' };

  if (!accountsConfigured(env)) {
    return NextResponse.json({ authenticated: false, accounts: false }, { headers });
  }

  const account = await readSession(accountsDb(env), request.headers.get('cookie'));
  if (!account) {
    return NextResponse.json({ authenticated: false, accounts: true }, { headers });
  }
  return NextResponse.json(
    { authenticated: true, accounts: true, email: account.email },
    { headers },
  );
}
