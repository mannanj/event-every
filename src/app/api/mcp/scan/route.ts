import { z } from 'zod';

import { appOrigin } from '@/server/accounts/env';
import { accountDek } from '@/server/accounts/store';
import { mcpJson, requireActor } from '@/server/mcp/actor';
import { readEventsByIds, writeEvents } from '@/server/mcp/events';
import { reviewDraftsToCalendarEvents } from '@/services/reviewEvent';
import { createReviewDrafts } from '@/services/scannerDraft';
import { ScanResponseSchema } from '@/types/scannerHttp';

export const dynamic = 'force-dynamic';

/**
 * Turn somebody's words into events on their account, through the app's own
 * scanner.
 *
 * WHY THIS CALLS /api/scan OVER HTTP rather than importing the job. That route
 * is where the owner budget is reserved, the request authority binds the call,
 * and TypeSafe gets its second opinion. Reaching past it would be a second
 * scan path with none of those, and the one nobody is watching is the one that
 * ends up wrong. The cost is a hop; `global_fetch_strictly_public` in
 * wrangler.jsonc is what makes that hop come back in through the app's routing
 * rather than being short-circuited inside the account.
 *
 * SPEND. An assistant scanning here spends the same owner budget as a browser,
 * under the same caps, by explicit decision. Task 201 is the standing warning
 * about what that budget does when it runs out: a failed provider call is
 * charged its full reservation, and one overrun freezes the whole UTC day for
 * everybody. A client that loops is the traffic that does it.
 */

const Body = z.object({
  text: z.string().min(1).max(20_000),
  /** IANA zone for reading times the source wrote without one. */
  timezone: z.string().max(100).nullish(),
});

/** Kept well under the 64KB an event is allowed to occupy once sealed. */
const ORIGINAL_INPUT_LIMIT = 4_000;

export async function POST(request: Request) {
  const gate = await requireActor(request);
  if (!gate.ok) return gate.response;
  const { db, env, actor } = gate.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return mcpJson({ error: 'Expected a JSON body.' }, 400);
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) return mcpJson({ error: 'Send some text to read.' }, 400);
  const { text } = parsed.data;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Event-Every-Request-Id': crypto.randomUUID(),
  };
  if (parsed.data.timezone) headers['X-Event-Every-Time-Zone'] = parsed.data.timezone;

  let response: Response;
  try {
    response = await fetch(new URL('/api/scan', appOrigin(request, env)).toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'text', text }),
    });
  } catch (error) {
    console.error('mcp scan unreachable', error instanceof Error ? error.message : 'unknown');
    return mcpJson({ error: 'The scanner could not be reached.' }, 502);
  }

  if (!response.ok) {
    // The budget and governor answers are the ones worth passing through
    // verbatim: "try again tomorrow" is actionable and "something failed" is
    // not. Everything else collapses.
    const detail = (await response.json().catch(() => null)) as
      | { error?: string; code?: string; resetAt?: string }
      | null;
    return mcpJson(
      {
        error: detail?.error ?? 'The scanner could not read that.',
        ...(detail?.code ? { code: detail.code } : {}),
        ...(detail?.resetAt ? { resetAt: detail.resetAt } : {}),
      },
      response.status,
    );
  }

  const scan = ScanResponseSchema.safeParse(await response.json().catch(() => null));
  if (!scan.success) return mcpJson({ error: 'The scanner could not read that.' }, 502);

  const createdAt = new Date().toISOString();
  const drafts = createReviewDrafts(scan.data, () => ({
    id: crypto.randomUUID(),
    exportUid: crypto.randomUUID(),
    createdAt,
  }));

  if (drafts.length === 0) return mcpJson({ events: [], found: 0 });

  const events = reviewDraftsToCalendarEvents(drafts, text.slice(0, ORIGINAL_INPUT_LIMIT));
  // The browser pushes an event as ordinary JSON, so its dates arrive as ISO
  // strings. Round-tripping here means a row written by an assistant is the
  // same shape as a row written by a tab, which is what lets both devices read
  // each other's.
  const stored = events.map((event) => JSON.parse(JSON.stringify(event)) as Record<string, unknown>);

  try {
    const dek = await accountDek(db, env.ACCOUNT_DATA_KEK!, actor.sub);
    await writeEvents(db, dek, actor.sub, stored);
    const ids = new Set(stored.map((event) => String(event.id)));
    const saved = await readEventsByIds(db, dek, actor.sub, ids);
    return mcpJson({ events: saved, found: drafts.length }, 201);
  } catch (error) {
    console.error('mcp scan save failed', error instanceof Error ? error.message : 'unknown');
    return mcpJson({ error: 'Read that, but could not save it.' }, 500);
  }
}
