import { z } from 'zod';

import { accountDek } from '@/server/accounts/store';
import { mcpJson, requireActor } from '@/server/mcp/actor';
import { readEvent, removeEvent } from '@/server/mcp/events';

export const dynamic = 'force-dynamic';

/**
 * Remove one event.
 *
 * A POST rather than a DELETE because the route manifest admits GET and POST
 * and nothing else. The verb is in the path instead, which costs nothing and
 * keeps the one admission policy that every route is checked against.
 */

const Body = z.object({ id: z.string().min(1).max(200) });

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
  if (!parsed.success) return mcpJson({ error: 'Which event?' }, 400);

  try {
    const dek = await accountDek(db, env.ACCOUNT_DATA_KEK!, actor.sub);
    // Read first, so removing something that is not yours is a 404 rather than
    // a tombstone written into your own account under somebody else's id.
    const event = await readEvent(db, dek, actor.sub, parsed.data.id);
    if (!event) return mcpJson({ error: 'No such event.' }, 404);
    await removeEvent(db, dek, actor.sub, parsed.data.id);
    return mcpJson({ deleted: parsed.data.id, title: event.title });
  } catch (error) {
    console.error('mcp remove failed', error instanceof Error ? error.message : 'unknown');
    return mcpJson({ error: 'Could not remove that.' }, 500);
  }
}
