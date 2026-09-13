import { NextResponse } from 'next/server';

import { readSession } from '@/server/accounts/auth';
import { accountsConfigured, accountsDb, accountsEnv } from '@/server/accounts/env';
import { accountDek, pushEvents, type PushInput } from '@/server/accounts/store';

export const dynamic = 'force-dynamic';

const MAX_ITEMS = 200;
const MAX_EVENT_BYTES = 64 * 1024;

/**
 * Write a batch of events, sealed before they reach the database.
 *
 * The plaintext exists only for the life of this request: it arrives, is
 * encrypted under the account's data key, and the ciphertext is what is stored.
 * Nothing here logs an event's contents.
 */
export async function POST(request: Request) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400, headers });
  }

  const raw = (body as { events?: unknown }).events;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: 'Expected an events array.' }, { status: 400, headers });
  }
  if (raw.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `Send at most ${MAX_ITEMS} events at a time.` },
      { status: 413, headers },
    );
  }

  const items: PushInput[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return NextResponse.json({ error: 'Malformed event.' }, { status: 400, headers });
    }
    const item = entry as { id?: unknown; event?: unknown; deleted?: unknown };
    if (typeof item.id !== 'string' || item.id.length === 0 || item.id.length > 200) {
      return NextResponse.json({ error: 'Every event needs an id.' }, { status: 400, headers });
    }
    if (item.deleted === true) {
      items.push({ id: item.id, deleted: true });
      continue;
    }
    // Bounded per event as well as per request: one enormous event would
    // otherwise pass the array-length check and still be stored.
    if (new TextEncoder().encode(JSON.stringify(item.event ?? null)).byteLength > MAX_EVENT_BYTES) {
      return NextResponse.json({ error: 'That event is too large.' }, { status: 413, headers });
    }
    items.push({ id: item.id, event: item.event ?? null });
  }

  try {
    const dek = await accountDek(db, env.ACCOUNT_DATA_KEK!, account.id);
    const updatedAt = await pushEvents(db, dek, account.id, items);
    return NextResponse.json({ saved: items.length, updatedAt }, { headers });
  } catch (error) {
    console.error('sync push failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Could not save your events.' }, { status: 500, headers });
  }
}
