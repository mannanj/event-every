import { NextResponse } from 'next/server';

import {
  SESSION_COOKIE,
  clearSession,
  clearedSessionCookie,
  readCookie,
} from '@/server/accounts/auth';
import { accountsConfigured, accountsDb, accountsEnv } from '@/server/accounts/env';

export const dynamic = 'force-dynamic';

/**
 * Sign out.
 *
 * The row goes first, then the cookie is cleared. Doing it the other way round
 * leaves a live session id in the database that a copy of the cookie could
 * still present. Always answers `{ success: true }` — the caller has nothing to
 * do differently if the row was already gone, and the cookie is cleared either
 * way.
 */
export async function POST(request: Request) {
  const env = accountsEnv();
  const id = readCookie(request.headers.get('cookie'), SESSION_COOKIE);

  if (id && accountsConfigured(env)) {
    try {
      await clearSession(accountsDb(env), id);
    } catch {
      // The cookie still gets cleared below; a failed delete must not leave the
      // browser believing it is signed in.
    }
  }

  return NextResponse.json(
    { success: true },
    { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': clearedSessionCookie() } },
  );
}
