import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMcpAuthContext } from 'agents/mcp';
import { z } from 'zod';

import {
  ApiError,
  getEvent,
  listEvents,
  removeEvent,
  saveEvents,
  scanInput,
  type Caller,
  type McpEventView,
  type ScanInput,
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

/**
 * The shape every event-returning tool reports, so a client that parses rather
 * than reads gets the same fields each time.
 *
 * Under a client that writes a script around these tools, the script parses the
 * output and the model never sees it. Prose is then a lossy encoding of data
 * the app already has structured, which is why `structuredContent` rides
 * alongside the text rather than instead of it: a human-facing client still
 * shows the sentence.
 */
const EventShape = z.object({
  id: z.string(),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  allDay: z.boolean(),
  timezone: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  url: z.string().nullable(),
  source: z.enum(['image', 'text', 'url']).nullable(),
  updatedAt: z.string(),
});


/**
 * A refusal with a code attached.
 *
 * "Sign in first" as prose is a sentence a model has to interpret; `code:
 * 'unauthenticated'` is something a script can branch on. Both are sent,
 * because the two kinds of client read different halves.
 */
function refusal(code: string, body: string) {
  return {
    content: [{ type: 'text' as const, text: body }],
    structuredContent: { error: { code, message: body } },
    isError: true,
  };
}

function problem(body: string) {
  return refusal('failed', body);
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

/**
 * Whether to keep the original wording alongside the events it produced.
 *
 * THREE STATES, AND THE MIDDLE ONE IS THE DEFAULT. Leaving it out follows
 * whatever the account chose in its own menu, which is the setting a person
 * made deliberately about their own data. `true` and `false` are each an
 * explicit override of that setting FOR THIS CALL ONLY, in both directions: on
 * when the account says off, off when the account says on. Neither changes the
 * account setting, and nothing here can.
 *
 * The override exists because the account switch answers "what should normally
 * happen" and a single request can have a reason the setting cannot know - a
 * transcription worth keeping from somebody who backs nothing up, or a private
 * message that should leave no copy from somebody who backs everything up.
 */
const BackupOriginal = z
  .boolean()
  .optional()
  .describe(
    'Keep the original text with the events, backed up to the account. Leave it ' +
      'out to follow the account setting. True backs this one up even if the ' +
      'account setting is off; false skips this one even if it is on. Either way ' +
      'the account setting itself is unchanged.',
  );

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
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: {},
      outputSchema: { email: z.string(), accountId: z.string() },
    },
    async () => {
      const caller = requireCaller();
      if (!caller) return refusal('unauthenticated', SIGN_IN);
      return {
        content: [{ type: 'text' as const, text: `Connected to Event Every as ${caller.email}.` }],
        structuredContent: { email: caller.email, accountId: caller.sub },
      };
    },
  );

  server.registerTool(
    'list_events',
    {
      title: 'Search my events',
      description:
        'Find events saved on this account, soonest first. Say what you are ' +
        'looking for: at least one of a date range, some text to match, or the ' +
        'kind of input it came from. There is no way to ask for everything, ' +
        'deliberately - narrow the search instead of paging through a calendar.',
      annotations: { readOnlyHint: true, openWorldHint: false },
      inputSchema: {
        from: z.string().optional().describe('Only events ending on or after this ISO date.'),
        to: z.string().optional().describe('Only events starting on or before this ISO date.'),
        query: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe('Text to look for in the title, location or description.'),
        source: z
          .enum(['image', 'text', 'url'])
          .optional()
          .describe('Only events that came from a photo, from typed words, or from a link.'),
        limit: z.number().int().min(1).max(50).optional().describe('Default and maximum 50.'),
      },
      outputSchema: {
        events: z.array(EventShape),
        searched: z.array(z.string()).describe('Which fields `query` was matched against.'),
        scanned: z.number().int().describe('How many stored events were read to answer this.'),
        complete: z
          .boolean()
          .describe('False when more events exist beyond what was considered. Narrow the search.'),
      },
    },
    async ({ from, to, query, source, limit }) => {
      const caller = requireCaller();
      if (!caller) return refusal('unauthenticated', SIGN_IN);
      if (!from && !to && !query && !source) {
        return refusal(
          'no_filter',
          'Say what you are looking for: a date range, some text, or a source.',
        );
      }
      try {
        const page = await listEvents(env, caller, { from, to, query, source, limit });
        const prose =
          page.events.length === 0
            ? 'Nothing on this account matches that.'
            : page.events.map(describe).join('\n\n') +
              (page.complete
                ? ''
                : '\n\nMore events exist beyond the ones searched. Narrow the range.');
        return { content: [{ type: 'text' as const, text: prose }], structuredContent: page };
      } catch (error) {
        return refusal('upstream', said(error, 'Could not read those.'));
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
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: {
        id: z.string().min(1).max(200),
        asCalendarFile: z
          .boolean()
          .optional()
          .describe('Attach the event as an .ics file as well as describing it.'),
      },
      outputSchema: { event: EventShape, ics: z.string().nullable() },
    },
    async ({ id, asCalendarFile }) => {
      const caller = requireCaller();
      if (!caller) return refusal('unauthenticated', SIGN_IN);
      try {
        const { event, ics } = await getEvent(env, caller, id, { ics: asCalendarFile === true });
        if (!ics) {
          return {
            content: [{ type: 'text' as const, text: describe(event) }],
            structuredContent: { event, ics: null },
          };
        }
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
          structuredContent: { event, ics },
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
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      inputSchema: {
        events: z.array(z.object(EventFields)).min(1).max(25),
        sourceText: z
          .string()
          .max(20_000)
          .optional()
          .describe(
            'The original wording these events came from, kept with them as the ' +
              'source. Only stored if backup is on for the account or backupOriginal is true.',
          ),
        backupOriginal: BackupOriginal,
      },
      outputSchema: { events: z.array(EventShape), backedUp: z.boolean() },
    },
    async ({ events, sourceText, backupOriginal }) => {
      const caller = requireCaller();
      if (!caller) return refusal('unauthenticated', SIGN_IN);
      try {
        const saved = await saveEvents(env, caller, events, { sourceText, backupOriginal });
        return {
          content: [
            {
              type: 'text' as const,
              text:
                `Saved ${saved.events.length === 1 ? 'it' : `${saved.events.length} events`}.` +
                `\n\n${saved.events.map(describe).join('\n\n')}`,
            },
          ],
          structuredContent: { events: saved.events, backedUp: saved.backedUp },
        };
      } catch (error) {
        return problem(said(error, 'Could not save that.'));
      }
    },
  );

  /**
   * FOUR WAYS IN, matching what the browser accepts, so connecting a client
   * does not hand somebody a lesser version of the product.
   *
   * Three of them spend the account owner's daily budget. `import_calendar` does
   * not: an .ics file states its events, so reading it is parsing rather than
   * inference. The descriptions say which is which, because a client that
   * writes a script picks between them with nobody watching.
   */
  const scanTool = (
    name: string,
    config: {
      title: string;
      description: string;
      inputSchema: Record<string, z.ZodTypeAny>;
      build: (args: Record<string, unknown>) => ScanInput;
    },
  ) => {
    server.registerTool(
      name,
      {
        title: config.title,
        description: config.description,
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        inputSchema: { ...config.inputSchema, backupOriginal: BackupOriginal },
        outputSchema: {
          events: z.array(EventShape),
          found: z.number().int(),
          backedUp: z.boolean(),
        },
      },
      async (args: Record<string, unknown>) => {
        const caller = requireCaller();
        if (!caller) return refusal('unauthenticated', SIGN_IN);
        try {
          const result = await scanInput(env, caller, config.build(args));
          if (result.events.length === 0) {
            return {
              content: [{ type: 'text' as const, text: 'No events could be read out of that.' }],
              structuredContent: { events: [], found: 0, backedUp: false },
            };
          }
          const kept = result.backedUp ? '\nThe original is backed up to the account.' : '';
          return {
            content: [
              {
                type: 'text' as const,
                text:
                  `Read ${result.found === 1 ? 'one event' : `${result.found} events`} and saved ` +
                  `${result.events.length === 1 ? 'it' : 'them'}.${kept}` +
                  `\n\n${result.events.map(describe).join('\n\n')}`,
              },
            ],
            structuredContent: result,
          };
        } catch (error) {
          return problem(said(error, 'Could not read that.'));
        }
      },
    );
  };

  const timezone = z
    .string()
    .optional()
    .describe("IANA zone to read clock times in when the source does not say. Use the person's.");

  scanTool('read_text_into_events', {
    title: 'Read events out of raw text',
    description:
      "Run Event Every's own scanner over a block of text - a pasted invitation, a " +
      'poster transcription, a forwarded email - and save whatever it finds. This ' +
      "calls a language model and spends the account owner's daily budget, so call " +
      'it once on the whole text rather than repeatedly, and prefer add_events when ' +
      'you have already read the details yourself.',
    inputSchema: { text: z.string().min(1).max(20_000).describe('The text to read.'), timezone },
    build: (args) => ({
      kind: 'text',
      text: String(args.text),
      timezone: args.timezone as string | undefined,
      backupOriginal: args.backupOriginal as boolean | undefined,
    }),
  });

  scanTool('read_image_into_events', {
    title: 'Read events out of a photo',
    description:
      'Read a photo of a poster, invitation, ticket or screenshot and save the ' +
      'events in it. Give EITHER `imageUrl`, a public link the server fetches, OR ' +
      '`imageBase64`, the raw bytes - which is for a client that can read a file ' +
      'from disk itself. Do not try to write out base64 by hand; pass a link ' +
      'instead. PNG, JPEG or WebP, up to 8MB. Spends the owner\'s daily budget.',
    inputSchema: {
      imageUrl: z.string().max(2000).optional().describe('A public link to the image.'),
      imageBase64: z
        .string()
        .max(16_000_000)
        .optional()
        .describe('The raw bytes, base64, with no data-URL prefix.'),
      mimeType: z
        .enum(['image/png', 'image/jpeg', 'image/webp'])
        .optional()
        .describe('Needed with imageBase64. Ignored with imageUrl, which is sniffed.'),
      filename: z.string().max(300).optional().describe('What to call the kept original.'),
      timezone,
    },
    build: (args) => ({
      kind: 'image',
      imageUrl: args.imageUrl as string | undefined,
      imageBase64: args.imageBase64 as string | undefined,
      mimeType: args.mimeType as 'image/png' | 'image/jpeg' | 'image/webp' | undefined,
      filename: args.filename as string | undefined,
      timezone: args.timezone as string | undefined,
      backupOriginal: args.backupOriginal as boolean | undefined,
    }),
  });

  scanTool('read_link_into_events', {
    title: 'Read events off a page',
    description:
      'Fetch a public web page and save the events on it. The server does the ' +
      'fetching, under the same policy the app uses for links, so private and ' +
      "local addresses are refused. Spends the owner's daily budget.",
    inputSchema: { url: z.string().min(1).max(2000).describe('The page to read.'), timezone },
    build: (args) => ({
      kind: 'url',
      url: String(args.url),
      timezone: args.timezone as string | undefined,
      backupOriginal: args.backupOriginal as boolean | undefined,
    }),
  });

  scanTool('import_calendar', {
    title: 'Import an .ics file',
    description:
      'Import events from the text of an .ics calendar file. This SPENDS NOTHING: ' +
      'an .ics file states its events, so they are parsed rather than inferred. ' +
      'Prefer it over read_text_into_events whenever what you have is really a ' +
      'calendar file.',
    inputSchema: {
      ics: z.string().min(1).max(1_000_000).describe('The contents of the .ics file.'),
      filename: z.string().max(300).optional(),
    },
    build: (args) => ({
      kind: 'calendar',
      ics: String(args.ics),
      filename: args.filename as string | undefined,
      backupOriginal: args.backupOriginal as boolean | undefined,
    }),
  });

  server.registerTool(
    'remove_event',
    {
      title: 'Remove an event',
      description:
        'Remove an event from this account by the id that list_events reports. ' +
        'It disappears from every device the person is signed in on, and this ' +
        'cannot be undone.',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: { id: z.string().min(1).max(200) },
      outputSchema: { deleted: z.string(), title: z.string() },
    },
    async ({ id }) => {
      const caller = requireCaller();
      if (!caller) return refusal('unauthenticated', SIGN_IN);
      try {
        const removed = await removeEvent(env, caller, id);
        return {
          content: [{ type: 'text' as const, text: `Removed "${removed.title}".` }],
          structuredContent: removed,
        };
      } catch (error) {
        // The app answers 404 both for a row that never existed and for one
        // belonging to somebody else, so this must not guess which.
        return problem(said(error, 'Could not remove that.'));
      }
    },
  );

  return server;
}
