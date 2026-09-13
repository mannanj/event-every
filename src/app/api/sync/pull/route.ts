import { NextResponse } from 'next/server';

import { readSession } from '@/server/accounts/auth';
import { accountsConfigured, accountsDb, accountsEnv } from '@/server/accounts/env';
import { accountDek, pullEvents } from '@/server/accounts/store';

export const dynamic = 'force-dynamic';

const MAX_PAGE = 200;

/**
 * Everything that changed since a cursor.
 *
 * The cursor is the `updatedAt` of the last row the client saw, and the next
 * cursor comes back with the page. Paging by timestamp rather than offset
 * because rows are written continuously: an offset would skip or repeat rows
 * whenever something changed mid-page.
 */
export async function GET(request: Request) {
  const env = accountsEnv();
  const headers = { 'Cache-Control': 'no-store' };

  if (!accountsConfigured(env)) {
    return NextResponse.json({ error: 'Accounts are not available.' }, { status: 503, headers });
  }

  const db = accountsDb(env);
  const account = await readSession(db, request.headers.get('cookie'));
  if (!account) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401, headers });
  }

  const url = new URL(request.url);
  const since = url.searchParams.get('since');
  const requested = Number(url.searchParams.get('limit') ?? MAX_PAGE);
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), MAX_PAGE)
    : MAX_PAGE;

  try {
    const dek = await accountDek(db, env.ACCOUNT_DATA_KEK!, account.id);
    const events = await pullEvents(db, dek, account.id, since, limit);
    return NextResponse.json(
      {
        events,
        // Null when the page was not full, meaning the client is caught up.
        cursor: events.length === limit ? events[events.length - 1]!.updatedAt : null,
      },
      { headers },
    );
  } catch (error) {
    console.error('sync pull failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Could not read your events.' }, { status: 500, headers });
  }
}
