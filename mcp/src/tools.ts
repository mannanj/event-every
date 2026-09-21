import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMcpAuthContext } from 'agents/mcp';
import { z } from 'zod';

import {
  ApiError,
  getEvent,
  listEvents,
  removeEvent,
  saveEvents,
  scanText,
  type Caller,
  type McpEventView,
  type ToolEnv,
} from './api';
import type { McpProps } from './authHandler';

/**
 * The tool surface.
 *
 * `whoami` exists purely as a test. If it answers, the entire chain worked: the
 * client registered, the browser signed in by email, the app signed a grant,
 * this Worker verified it, exchanged it for a token, and that token carried an
 * identity into a tool call. Nothing else needs running to know sign-in is
 * sound.
 *
 * TWO WAYS TO ADD AN EVENT, and the split is deliberate. `add_events` takes
 * fields a model already worked out and costs nothing. `read_text_into_events`
 * runs Event Every's own scanner, which spends the owner budget on every call.
 * The descriptions say so, because the model choosing between them is the only
 * thing standing between a chatty client and a frozen day.
 *
 * Every tool requires an account. There is no anonymous surface here: the whole
 * point of the connector is to act as somebody.
 */

function text(body: string) {
  return { content: [{ type: 'text' as const, text: body }] };
}

function problem(body: string) {
  return { content: [{ type: 'text' as const, text: body }], isError: true };
}

/**
 * Who this call is for.
 *
 * Read out of the per-request auth context, where the authorize flow put it. It
 * is never taken from a tool argument: an argument is something a model can
 * make up, and this one decides whose calendar is touched.
 */
function requireCaller(): Caller | null {
  const props = getMcpAuthContext()?.props as McpProps | undefined;
  if (!props?.userId || !props?.email) return null;
  return { sub: props.userId, email: props.email };
}

const SIGN_IN = 'Sign in first: this needs a connected Event Every account.';

function when(event: McpEventView): string {
  if (event.allDay) return `${event.start.slice(0, 10)} (all day)`;
  const zone = event.timezone ? ` ${event.timezone}` : '';
  return `${event.start}${zone}`;
}

function describe(event: McpEventView): string {
  const lines = [`${event.title} - ${when(event)}`];
  if (event.location) lines.push(`  where: ${event.location}`);
  if (event.description) lines.push(`  ${event.description}`);
  if (event.url) lines.push(`  ${event.url}`);
  lines.push(`  id: ${event.id}`);
  return lines.join('\n');
}

function said(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

const EventFields = {
  title: z.string().min(1).max(300).describe('What the event is called.'),
  start: z
    .string()
    .describe('When it starts, ISO 8601. Include an offset or Z when you know the zone.'),
  end: z.string().optional().describe('When it ends. Defaults to an hour after the start.'),
  allDay: z.boolean().optional().describe('True for a whole-day event with no clock time.'),
  timezone: z.string().optional().describe('IANA zone, such as America/Vancouver.'),
  location: z.string().max(500).optional(),
  description: z.string().max(4000).optional(),
  url: z.string().max(2000).optional(),
};

export function createEventEveryMcpServer(env: ToolEnv): McpServer {
  const server = new McpServer({ name: 'event-every', version: '1.0.0' });

  server.registerTool(
    'whoami',
    {
      title: 'Which account am I?',
      description:
        'The email address this connection is signed in as. Use it to confirm the ' +
        'connection works and belongs to the right person.',
      inputSchema: {},
    },
    async () => {
      const caller = requireCaller();
      if (!caller) return problem(SIGN_IN);
      return text(`Connected to Event Every as ${caller.email}.`);
    },
  );

  server.registerTool(
    'list_events',
    {
      title: 'List my events',
      description:
        'Events saved on this account, soonest first. Narrow with `from` and `to` ' +
        'when the person asked about a particular stretch of time.',
      inputSchema: {
        from: z.string().optional().describe('Only events ending on or after this ISO date.'),
        to: z.string().optional().describe('Only events starting on or before this ISO date.'),
        limit: z.number().int().min(1).max(200).optional().describe('Default 50.'),
      },
    },
    async ({ from, to, limit }) => {
      const caller = requireCaller();
      if (!caller) return problem(SIGN_IN);
      try {
        const events = await listEvents(env, caller, { from, to, limit });
        if (events.length === 0) return text('Nothing saved on this account for that.');
        return text(events.map(describe).join('\n\n'));
      } catch (error) {
        return said(error, 'Could not read those.') === 'Could not read those.'
          ? problem('Could not read those.')
          : problem(said(error, 'Could not read those.'));
      }
    },
  );

  server.registerTool(
    'get_event',
    {
      title: 'One event, and its calendar file',
      description:
        'One saved event by the id that list_events reports. With `asCalendarFile`, ' +
        'also returns it as an .ics attachment the person can save or send on.',
      inputSchema: {
        id: z.string().min(1).max(200),
        asCalendarFile: z
          .boolean()
          .optional()
          .describe('Attach the event as an .ics file as well as describing it.'),
      },
    },
    async ({ id, asCalendarFile }) => {
      const caller = requireCaller();
      if (!caller) return problem(SIGN_IN);
      try {
        const { event, ics } = await getEvent(env, caller, id, { ics: asCalendarFile === true });
        if (!ics) return text(describe(event));
        // An embedded resource rather than a wall of calendar syntax in the
        // reply: a client can offer it as a file to save, and a model that
        // wants to read it still can.
        return {
          content: [
            { type: 'text' as const, text: describe(event) },
            {
              type: 'resource' as const,
              resource: {
                uri: `eventevery://event/${event.id}.ics`,
                mimeType: 'text/calendar',
                text: ics,
              },
            },
          ],
        };
      } catch (error) {
        return problem(said(error, 'Could not read that.'));
      }
    },
  );

  server.registerTool(
    'add_events',
    {
      title: 'Save events I already worked out',
      description:
        'Save one or more events to this account from details you already have. ' +
        'Prefer this whenever you can read the date and time yourself: it is ' +
        'immediate and costs nothing. Use read_text_into_events only for raw text ' +
        'you have not parsed.',
      inputSchema: {
        events: z.array(z.object(EventFields)).min(1).max(25),
      },
    },
    async ({ events }) => {
      const caller = requireCaller();
      if (!caller) return problem(SIGN_IN);
      try {
        const saved = await saveEvents(env, caller, events);
        return text(
          `Saved ${saved.length === 1 ? 'it' : `${saved.length} events`}.\n\n${saved
            .map(describe)
            .join('\n\n')}`,
        );
      } catch (error) {
        return problem(said(error, 'Could not save that.'));
      }
    },
  );

  server.registerTool(
    'read_text_into_events',
    {
      title: 'Read events out of raw text',
      description:
        "Run Event Every's own scanner over a block of text - a pasted invitation, " +
        'a poster transcription, a forwarded email - and save whatever it finds. ' +
        'This calls a language model and spends the account owner\'s daily budget, ' +
        'so call it once on the whole text rather than repeatedly, and prefer ' +
        'add_events when you have already read the details yourself.',
      inputSchema: {
        text: z.string().min(1).max(20_000).describe('The text to read.'),
        timezone: z
          .string()
          .optional()
          .describe(
            "IANA zone to read clock times in when the text does not say. Use the person's.",
          ),
      },
    },
    async ({ text: input, timezone }) => {
      const caller = requireCaller();
      if (!caller) return problem(SIGN_IN);
      try {
        const result = await scanText(env, caller, { text: input, timezone });
        if (result.events.length === 0) return text('No events could be read out of that.');
        return text(
          `Read ${result.found === 1 ? 'one event' : `${result.found} events`} and saved ` +
            `${result.events.length === 1 ? 'it' : 'them'}.\n\n${result.events
              .map(describe)
              .join('\n\n')}`,
        );
      } catch (error) {
        return problem(said(error, 'Could not read that.'));
      }
    },
  );

  server.registerTool(
    'remove_event',
    {
      title: 'Remove an event',
      description:
        'Remove an event from this account by the id that list_events reports. ' +
        'It disappears from every device the person is signed in on, and this ' +
        'cannot be undone.',
      inputSchema: { id: z.string().min(1).max(200) },
    },
    async ({ id }) => {
      const caller = requireCaller();
      if (!caller) return problem(SIGN_IN);
      try {
        const { title } = await removeEvent(env, caller, id);
        return text(`Removed "${title}".`);
      } catch (error) {
        // The app answers 404 both for a row that never existed and for one
        // belonging to somebody else, so this must not guess which.
        return problem(said(error, 'Could not remove that.'));
      }
    },
  );

  return server;
}
