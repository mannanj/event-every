import { z } from 'zod';

import { appOrigin, attachmentsBucket } from '@/server/accounts/env';
import { accountDek } from '@/server/accounts/store';
import { mcpJson, requireActor } from '@/server/mcp/actor';
import { mcpEnv } from '@/server/mcp/env';
import { SCAN_ON_BEHALF_HEADER, signScanOnBehalf } from '@/server/mcp/grant';
import { readEventsByIds, writeEvents } from '@/server/mcp/events';
import {
  IntakeError,
  decodeBase64,
  fetchImageAsDataUrl,
  fetchPageText,
  scrapePage,
} from '@/server/mcp/intake';
import { keepOriginal, resolveBackup } from '@/server/mcp/original';
import { parseICSContent } from '@/services/icsParser';
import { reviewDraftsToCalendarEvents } from '@/services/reviewEvent';
import { resolveScanTimeZone } from '@/server/scanner/scanContext';

/**
 * The caller's zone for reading the scanner's wall-clock times — the same one
 * the scanner was given. Without it the conversion falls back to the runtime's
 * zone, which on a Worker is UTC.
 */
const readerZone = (timezone: string | null | undefined): string | undefined =>
  timezone ? resolveScanTimeZone(timezone) : undefined;
import { createReviewDrafts } from '@/services/scannerDraft';
import { validateScannerImageDataUrl } from '@/server/scanner/image';
import { ScanResponseSchema } from '@/types/scannerHttp';
import { detectUrlsDeterministically } from '@/services/urlDetector';
import { IMAGE_SCAN_CONCURRENCY, linkForPhotos, readLinks, readText, withTypedLink } from '@/services/readSources';
import { withTypicalDuration } from '@/services/scanTriage';
import { triageForScan } from '@/server/typesafe/triage';
import { mapWithConcurrency } from '@/utils/concurrency';
import type { CalendarEvent } from '@/types/event';

export const dynamic = 'force-dynamic';

/**
 * Every way Event Every can be given something, reachable by an assistant.
 *
 * The browser accepts four kinds of input, and all four are here so that
 * connecting a client does not hand somebody a lesser version of the product:
 *
 *   text       typed or pasted words                    spends budget
 *   image      a PNG, JPEG or WebP                      spends budget
 *   url        a page, fetched and read                 spends budget
 *   calendar   an .ics file, parsed not inferred        spends NOTHING
 *
 * AN IMAGE CANNOT BE TYPED BY A MODEL, which is the constraint that shapes this
 * route. A chat model will not emit a megabyte of accurate base64, and no host
 * forwards an attached file to a remote MCP server. So an image arrives either
 * as bytes from a client that runs code and can read a file, or as a URL this
 * fetches - and the fetch goes through the resolver policy rather than plain
 * `fetch`, because "retrieve whatever this says" next to the account database
 * is the server-side request forgery shape.
 *
 * WHY /api/scan OVER HTTP rather than importing the job: that route is where
 * the owner budget is reserved, the request authority binds the call, and
 * TypeSafe gets its second opinion. Reaching past it would be a second scan
 * path with none of those. `global_fetch_strictly_public` in wrangler.jsonc is
 * what makes the hop come back in through the app's own routing.
 *
 * SPEND. Every kind but `calendar` costs the account owner's daily budget, at
 * the same caps as a browser, by explicit decision. Task 201 is the standing
 * warning about what that budget does when it runs out: a failed provider call
 * is charged its full reservation and one overrun freezes the whole UTC day.
 * `calendar` spends nothing because an .ics file states its events; reading it
 * is parsing, not inference.
 */

const Backup = z.boolean().optional();

const Body = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    text: z.string().min(1).max(20_000),
    timezone: z.string().max(100).nullish(),
    backupOriginal: Backup,
  }),
  z.object({
    kind: z.literal('image'),
    /** Raw base64, no data-URL prefix. For a client that can read a file. */
    imageBase64: z.string().min(1).max(16_000_000).optional(),
    /** Or a link, which this fetches under the resolver policy. */
    imageUrl: z.string().min(1).max(2000).optional(),
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']).optional(),
    filename: z.string().max(300).optional(),
    timezone: z.string().max(100).nullish(),
    backupOriginal: Backup,
  }),
  z.object({
    kind: z.literal('url'),
    url: z.string().min(1).max(2000),
    timezone: z.string().max(100).nullish(),
    backupOriginal: Backup,
  }),
  z.object({
    // Everything in the input box at once: the words and the photos beside
    // them, read through the same steps as the site's own input (readSources).
    kind: z.literal('input'),
    text: z.string().max(20_000).optional(),
    images: z.array(z.object({
      imageBase64: z.string().min(1).max(16_000_000),
      mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
      filename: z.string().max(300).optional(),
    })).max(10).optional(),
    timezone: z.string().max(100).nullish(),
    backupOriginal: Backup,
  }),
  z.object({
    kind: z.literal('calendar'),
    /** The .ics text itself. */
    ics: z.string().min(1).max(1_000_000),
    filename: z.string().max(300).optional(),
    backupOriginal: Backup,
  }),
]);

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
  if (!parsed.success) return mcpJson({ error: 'Send something to read.' }, 400);
  const input = parsed.data;

  // One input-history entry for the batch, stamped onto every event the way the
  // browser stamps `inputEntryIds`. It is also what the kept original is filed
  // under, so a device restoring the entry gets what the events came from.
  const entryId = crypto.randomUUID();

  let events;
  let original: { bytes: Uint8Array; name: string; mimeType: string } | null = null;
  let found: number;

  try {
    if (input.kind === 'calendar') {
      // No model, no budget, no scanner. An .ics file states its events; a
      // second opinion on what it says would be inventing doubt.
      const parsedEvents = parseICSContent(input.ics);
      if (parsedEvents.length === 0) {
        return mcpJson({ error: 'No events could be read out of that file.' }, 400);
      }
      events = parsedEvents;
      found = parsedEvents.length;
      original = {
        bytes: new TextEncoder().encode(input.ics),
        name: input.filename ?? 'imported.ics',
        mimeType: 'text/calendar',
      };
    } else if (input.kind === 'input') {
      const read = await readInput(input, (scanRequest, durationMinutes, provenance) =>
        scanOnce(request, env, actor, scanRequest, input.timezone, durationMinutes, provenance));
      if (read.events.length === 0) return mcpJson({ events: [], found: 0, backedUp: false });
      events = read.events;
      found = read.events.length;
      original = read.original;
    } else {
      const prepared = await prepare(input, request.signal);
      original = prepared.original;
      events = await scanOnce(request, env, actor, prepared.scanRequest, input.timezone, null, prepared.provenance);
      if (events.length === 0) return mcpJson({ events: [], found: 0, backedUp: false });
      found = events.length;
    }
  } catch (error) {
    if (error instanceof ScanRefused) return mcpJson(error.body, error.status);
    if (error instanceof IntakeError) return mcpJson({ error: error.message }, 400);
    console.error('mcp intake failed', error instanceof Error ? error.message : 'unknown');
    return mcpJson({ error: 'Could not read that.' }, 500);
  }

  // The browser pushes an event as ordinary JSON, so its dates arrive as ISO
  // strings. Round-tripping means a row written by an assistant is the same
  // shape as one written by a tab, which is what lets both read each other's.
  const stored: Record<string, unknown>[] = events.map((event) => ({
    ...(JSON.parse(JSON.stringify(event)) as Record<string, unknown>),
    inputEntryIds: [entryId],
  }));

  try {
    const dek = await accountDek(db, env.ACCOUNT_DATA_KEK!, actor.sub);
    await writeEvents(db, dek, actor.sub, stored);
    const ids = new Set(stored.map((event) => String(event.id)));
    const saved = await readEventsByIds(db, dek, actor.sub, ids);

    // After the events are saved, never before. The original is the lesser
    // half: if keeping it fails the events still exist, and the answer says
    // `backedUp: false` rather than reporting a failure for the part that
    // worked.
    let backedUp = false;
    if (original && (await resolveBackup(db, env, actor.sub, input.backupOriginal))) {
      ({ backedUp } = await keepOriginal(db, attachmentsBucket(env), dek, actor.sub, {
        entryId,
        ...original,
      }));
    }

    return mcpJson({ events: saved, found, backedUp }, 201);
  } catch (error) {
    console.error('mcp scan save failed', error instanceof Error ? error.message : 'unknown');
    return mcpJson({ error: 'Read that, but could not save it.' }, 500);
  }
}

/**
 * Turn whatever arrived into the one shape /api/scan takes, plus the original
 * worth keeping and the provenance string the card shows.
 */
async function prepare(
  input: Extract<z.infer<typeof Body>, { kind: 'text' | 'image' | 'url' }>,
  signal: AbortSignal,
): Promise<{
  scanRequest: { kind: 'text'; text: string } | { kind: 'image'; dataUrl: string };
  original: { bytes: Uint8Array; name: string; mimeType: string } | null;
  provenance: string;
}> {
  if (input.kind === 'text') {
    return {
      scanRequest: { kind: 'text', text: input.text },
      original: {
        bytes: new TextEncoder().encode(input.text),
        name: 'original.txt',
        mimeType: 'text/plain',
      },
      provenance: input.text.slice(0, 4_000),
    };
  }

  if (input.kind === 'url') {
    const text = await fetchPageText(input.url, signal);
    return {
      scanRequest: { kind: 'text', text: text.slice(0, 100_000) },
      original: {
        bytes: new TextEncoder().encode(text),
        name: 'page.txt',
        mimeType: 'text/plain',
      },
      // The link, not the scraped body: it is what the person would recognise,
      // and the body is already kept as the original.
      provenance: input.url,
    };
  }

  const dataUrl = input.imageUrl
    ? await fetchImageAsDataUrl(input.imageUrl, signal)
    : `data:${input.mimeType ?? 'image/jpeg'};base64,${input.imageBase64 ?? ''}`;

  if (!input.imageUrl && !input.imageBase64) {
    throw new IntakeError('Send an image, either as bytes or as a link.');
  }

  // The same validator the browser's path uses: media type, size, and the
  // file's own leading bytes, so a JPEG relabelled as a PNG is refused here
  // rather than confusing a model later.
  try {
    validateScannerImageDataUrl(dataUrl);
  } catch {
    throw new IntakeError('That is not a readable PNG, JPEG or WebP image.');
  }

  const comma = dataUrl.indexOf(',');
  const mimeType = dataUrl.slice(5, dataUrl.indexOf(';'));
  const bytes = decodeBase64(dataUrl.slice(comma + 1));

  return {
    scanRequest: { kind: 'image', dataUrl },
    original: bytes
      ? { bytes, name: input.filename ?? `original.${mimeType.split('/')[1]}`, mimeType }
      : null,
    provenance: input.imageUrl ?? input.filename ?? 'image',
  };
}

/** /api/scan said no: its answer goes back to the assistant as it came. */
class ScanRefused extends Error {
  constructor(readonly status: number, readonly body: Record<string, unknown>) {
    super(String(body.error ?? 'refused'));
  }
}

type ScanRequestBody = { kind: 'text'; text: string } | { kind: 'image'; dataUrl: string };

/**
 * One scan through /api/scan, as the browser makes it, turned into calendar
 * events the way the site's page does: the scanner's drafts, then a typical
 * duration where the source stated no end (verification's guess per event,
 * else triage's for the batch).
 */
async function scanOnce(
  request: Request,
  env: Parameters<typeof appOrigin>[1],
  actor: { sub: string; email: string },
  scanRequest: ScanRequestBody,
  timezone: string | null | undefined,
  durationMinutes: number | null,
  provenance: string,
): Promise<CalendarEvent[]> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Event-Every-Request-Id': crypto.randomUUID(),
  };
  // Whose scan this is. Without it /api/scan sees only this Worker's own
  // address, so every caller would share one per-person cap and nobody
  // would be recognised as admin.
  headers[SCAN_ON_BEHALF_HEADER] = await signScanOnBehalf(
    { sub: actor.sub, email: actor.email },
    mcpEnv().MCP_GRANT_SECRET ?? '',
  );
  if (timezone) headers['X-Event-Every-Time-Zone'] = timezone;

  let response: Response;
  try {
    response = await fetch(new URL('/api/scan', appOrigin(request, env)).toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify(scanRequest),
    });
  } catch (error) {
    console.error('mcp scan unreachable', error instanceof Error ? error.message : 'unknown');
    throw new ScanRefused(502, { error: 'The scanner could not be reached.' });
  }

  if (!response.ok) {
    // The budget and governor answers are worth passing through verbatim:
    // "try again tomorrow" is actionable and "something failed" is not.
    const detail = (await response.json().catch(() => null)) as
      | { error?: string; code?: string; resetAt?: string }
      | null;
    throw new ScanRefused(response.status, {
      error: detail?.error ?? 'The scanner could not read that.',
      ...(detail?.code ? { code: detail.code } : {}),
      ...(detail?.resetAt ? { resetAt: detail.resetAt } : {}),
    });
  }

  const scan = ScanResponseSchema.safeParse(await response.json().catch(() => null));
  if (!scan.success) throw new ScanRefused(502, { error: 'The scanner could not read that.' });

  const createdAt = new Date().toISOString();
  const drafts = createReviewDrafts(scan.data, () => ({
    id: crypto.randomUUID(),
    exportUid: crypto.randomUUID(),
    createdAt,
  }));
  const verified = new Map((scan.data.verification ?? []).map((one) => [one.candidateId, one.durationMinutes]));
  return reviewDraftsToCalendarEvents(drafts, provenance, readerZone(timezone)).map((event, index) => {
    const { candidate } = drafts[index];
    return withTypicalDuration(event, candidate.temporal.value?.end != null, verified.get(candidate.candidateId) ?? durationMinutes);
  });
}

/**
 * The input box, read on the server through the site's own steps
 * (services/readSources): text alone is found-links, fetched pages, triage,
 * scan; photos are scanned one by one and take their link from the words
 * typed beside them.
 */
async function readInput(
  input: Extract<z.infer<typeof Body>, { kind: 'input' }>,
  scan: (request: ScanRequestBody, durationMinutes: number | null, provenance: string) => Promise<CalendarEvent[]>,
): Promise<{ events: CalendarEvent[]; original: { bytes: Uint8Array; name: string; mimeType: string } | null }> {
  const text = input.text?.trim() ?? '';
  const images = input.images ?? [];
  if (!text && images.length === 0) throw new IntakeError('Send something to read.');
  const signal = new AbortController().signal;
  const linkSteps = {
    detect: async (value: string) => detectUrlsDeterministically(value),
    scrape: (urls: string[]) => mapWithConcurrency(urls, 2, (url) => scrapePage(url, signal)),
  };

  if (images.length === 0) {
    const outcome = await readText<CalendarEvent>(text, {
      ...linkSteps,
      triage: (value, source) => triageForScan(value, source, signal),
      scan: (value, { durationMinutes }) => scan({ kind: 'text', text: value }, durationMinutes, text.slice(0, 4_000)),
    });
    return {
      events: outcome.kind === 'scanned' ? outcome.items : [],
      original: { bytes: new TextEncoder().encode(text), name: 'original.txt', mimeType: 'text/plain' },
    };
  }

  // The links are fetched while the first photo is read: neither waits on the other.
  const [links, perImage] = await Promise.all([
    text ? readLinks(text, linkSteps) : Promise.resolve(null),
    mapWithConcurrency(images, IMAGE_SCAN_CONCURRENCY, async (image) => {
      const dataUrl = `data:${image.mimeType};base64,${image.imageBase64}`;
      try {
        validateScannerImageDataUrl(dataUrl);
      } catch {
        throw new IntakeError('That is not a readable PNG, JPEG or WebP image.');
      }
      return scan({ kind: 'image', dataUrl }, null, image.filename ?? 'image');
    }),
  ]);
  const first = images[0];
  const bytes = decodeBase64(first.imageBase64);
  return {
    events: withTypedLink(perImage.flat(), links ? linkForPhotos(links) : null),
    original: bytes
      ? { bytes, name: first.filename ?? `original.${first.mimeType.split('/')[1]}`, mimeType: first.mimeType }
      : null,
  };
}
