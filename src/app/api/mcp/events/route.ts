import { accountDek } from '@/server/accounts/store';
import { mcpJson, requireActor } from '@/server/mcp/actor';
import { readEvent, readEvents } from '@/server/mcp/events';
import { eventToIcs } from '@/server/mcp/ics';

export const dynamic = 'force-dynamic';

/**
 * Read the account's events, for the MCP Worker only.
 *
 * Reading and writing are separate routes because the route manifest pins
 * exactly one method per path - see src/platform/route-manifest.ts, where the
 * same split already exists for /api/sync/pull and /api/sync/push. So this is
 * GET, `save` is POST, and `remove` is POST.
 *
 * Every read is scoped to `actor.sub`, taken from the token's signature. The
 * account id is never accepted as input, which is what makes one account's
 * token unable to reach another's events.
 */
export async function GET(request: Request) {
  const gate = await requireActor(request);
  if (!gate.ok) return gate.response;
  const { db, env, actor } = gate.context;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const limit = Number(url.searchParams.get('limit') ?? 50);

  try {
    const dek = await accountDek(db, env.ACCOUNT_DATA_KEK!, actor.sub);

    if (id) {
      const event = await readEvent(db, dek, actor.sub, id);
      // 404 whether it never existed or belongs to somebody else. Telling those
      // apart would make this an oracle for other people's event ids.
      if (!event) return mcpJson({ error: 'No such event.' }, 404);
      const ics = url.searchParams.get('format') === 'ics' ? eventToIcs(event) : null;
      return mcpJson({ events: [event], ...(ics ? { ics } : {}) });
    }

    const events = await readEvents(db, dek, actor.sub, {
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      limit: Number.isFinite(limit) ? limit : 50,
    });
    return mcpJson({ events });
  } catch (error) {
    console.error('mcp list failed', error instanceof Error ? error.message : 'unknown');
    return mcpJson({ error: 'Could not read your events.' }, 500);
  }
}
