import { z } from 'zod';

import { accountDek } from '@/server/accounts/store';
import { mcpJson, requireActor } from '@/server/mcp/actor';
import { buildStoredEvent, readEventsByIds, writeEvents } from '@/server/mcp/events';

export const dynamic = 'force-dynamic';

/**
 * Add events an assistant was given directly, with no scanner involved.
 *
 * This is the cheap path and the one to prefer: a model that has already read a
 * date out of a conversation does not need the scanner to read it again, and
 * this spends nothing. /api/mcp/scan is for raw text nobody has parsed.
 */

const IsoDate = z.string().min(4).max(64);

const CreateEvent = z.object({
  title: z.string().min(1).max(300),
  start: IsoDate,
  end: IsoDate.nullish(),
  allDay: z.boolean().optional(),
  timezone: z.string().max(100).nullish(),
  location: z.string().max(500).nullish(),
  description: z.string().max(4000).nullish(),
  url: z.string().max(2000).nullish(),
});

const Body = z.object({ events: z.array(CreateEvent).min(1).max(25) });

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
  if (!parsed.success) return mcpJson({ error: 'That is not a usable event.' }, 400);

  const created = new Date();
  let stored;
  try {
    stored = parsed.data.events.map((event) =>
      buildStoredEvent(event, { id: crypto.randomUUID(), created }),
    );
  } catch {
    // The only throw in there is an unreadable start, and a model told which
    // half was wrong can fix it.
    return mcpJson({ error: 'That start date could not be read.' }, 400);
  }

  try {
    const dek = await accountDek(db, env.ACCOUNT_DATA_KEK!, actor.sub);
    await writeEvents(db, dek, actor.sub, stored);
    const ids = new Set(stored.map((event) => String(event.id)));
    return mcpJson({ events: await readEventsByIds(db, dek, actor.sub, ids) }, 201);
  } catch (error) {
    console.error('mcp save failed', error instanceof Error ? error.message : 'unknown');
    return mcpJson({ error: 'Could not save that.' }, 500);
  }
}
