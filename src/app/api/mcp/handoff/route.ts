import { z } from 'zod';

import {
  accountsConfigured,
  accountsDb,
  accountsEnv,
  appOrigin,
  attachmentsBucket,
} from '@/server/accounts/env';
import { accountDek } from '@/server/accounts/store';
import { mcpJson, requireActor } from '@/server/mcp/actor';
import { readEventsByIds, writeEvents } from '@/server/mcp/events';
import { HANDOFF_TTL_SECONDS, burnHandoff, signHandoff, verifyHandoff } from '@/server/mcp/handoff';
import { mcpEnv } from '@/server/mcp/env';
import { keepOriginal, resolveBackup } from '@/server/mcp/original';
import { reviewDraftsToCalendarEvents } from '@/services/reviewEvent';
import { createReviewDrafts } from '@/services/scannerDraft';
import { decodeBase64 } from '@/server/mcp/intake';
import { validateScannerImageDataUrl } from '@/server/scanner/image';
import { ScanResponseSchema } from '@/types/scannerHttp';

export const dynamic = 'force-dynamic';

/**
 * Two jobs behind one path, told apart by who is asking.
 *
 * MINT (actor token, from the MCP Worker): hand back a one-time upload link
 * for the connected account.
 *
 * REDEEM (handoff token, from the person's browser): accept the photo that
 * link was minted for, scan it, and save the events.
 *
 * WHY IT EXISTS. `read_image_into_events` already takes a URL or raw bytes,
 * which covers a photo on the web and a client that can read a file off disk.
 * Neither covers the commonest case: a photo on somebody's phone, in a chat
 * client that cannot reach the camera roll, and a model that cannot type a
 * megabyte of base64. So the assistant hands over a link instead of fetching
 * anything.
 *
 * THE REDEEM HALF TAKES NO ACCOUNT ID. It takes a signed token that already
 * names one. A caller cannot aim somebody else's upload at their own events, or
 * their own upload at somebody else's.
 */

const Mint = z.object({ action: z.literal('mint') });

const Redeem = z.object({
  action: z.literal('redeem'),
  token: z.string().min(1).max(4000),
  imageBase64: z.string().min(1).max(16_000_000),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  filename: z.string().max(300).optional(),
  timezone: z.string().max(100).optional(),
});

const Body = z.discriminatedUnion('action', [Mint, Redeem]);

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return mcpJson({ error: 'Expected a JSON body.' }, 400);
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) return mcpJson({ error: 'That is not a usable request.' }, 400);

  return parsed.data.action === 'mint'
    ? mint(request)
    : redeem(request, parsed.data);
}

/** Minting needs an actor token: only the connected assistant may ask. */
async function mint(request: Request) {
  const gate = await requireActor(request);
  if (!gate.ok) return gate.response;
  const { env, actor } = gate.context;

  const secret = mcpEnv().MCP_GRANT_SECRET;
  if (!secret) return mcpJson({ error: 'Uploads are not available.' }, 503);

  const token = await signHandoff({ sub: actor.sub, email: actor.email }, secret);
  const url = new URL('/upload', appOrigin(request, env));
  url.searchParams.set('t', token);

  return mcpJson({
    url: url.toString(),
    expiresInSeconds: HANDOFF_TTL_SECONDS,
    email: actor.email,
  });
}

/**
 * Redeeming needs the handoff token and nothing else.
 *
 * No session, because the person may not be signed in on the phone they are
 * holding - which is the whole reason this path exists.
 */
async function redeem(request: Request, input: z.infer<typeof Redeem>) {
  const env = accountsEnv();
  if (!accountsConfigured(env)) return mcpJson({ error: 'Uploads are not available.' }, 503);

  const secret = mcpEnv().MCP_GRANT_SECRET;
  if (!secret) return mcpJson({ error: 'Uploads are not available.' }, 503);

  const who = await verifyHandoff(input.token, secret);
  // One message for expired, forged and malformed alike. Which one it was is
  // information for somebody probing, not for somebody who waited too long.
  if (!who) return mcpJson({ error: 'That upload link has expired. Ask for a new one.' }, 403);

  // SPEND IT BEFORE DOING ANY WORK. Burning first means a second upload of the
  // same link loses the race rather than racing the scan - and the scan is the
  // part that costs money. An already-spent link gets the same message as an
  // expired one, because from the person's side they are the same thing.
  if (!(await burnHandoff(accountsDb(env), input.token, who.sub))) {
    return mcpJson({ error: 'That upload link has expired. Ask for a new one.' }, 403);
  }

  const dataUrl = `data:${input.mimeType};base64,${input.imageBase64}`;
  try {
    validateScannerImageDataUrl(dataUrl);
  } catch {
    return mcpJson({ error: 'That is not a readable PNG, JPEG or WebP image.' }, 400);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Event-Every-Request-Id': crypto.randomUUID(),
  };
  if (input.timezone) headers['X-Event-Every-Time-Zone'] = input.timezone;

  let response: Response;
  try {
    response = await fetch(new URL('/api/scan', appOrigin(request, env)).toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'image', dataUrl }),
    });
  } catch {
    return mcpJson({ error: 'The scanner could not be reached.' }, 502);
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    return mcpJson({ error: detail?.error ?? 'The scanner could not read that.' }, response.status);
  }

  const scan = ScanResponseSchema.safeParse(await response.json().catch(() => null));
  if (!scan.success) return mcpJson({ error: 'The scanner could not read that.' }, 502);

  const createdAt = new Date().toISOString();
  const drafts = createReviewDrafts(scan.data, () => ({
    id: crypto.randomUUID(),
    exportUid: crypto.randomUUID(),
    createdAt,
  }));
  if (drafts.length === 0) return mcpJson({ events: [], found: 0, backedUp: false });

  const entryId = crypto.randomUUID();
  const stored: Record<string, unknown>[] = reviewDraftsToCalendarEvents(
    drafts,
    input.filename ?? 'photo',
  ).map((event) => ({
    ...(JSON.parse(JSON.stringify(event)) as Record<string, unknown>),
    inputEntryIds: [entryId],
  }));

  try {
    const db = accountsDb(env);
    const dek = await accountDek(db, env.ACCOUNT_DATA_KEK!, who.sub);
    await writeEvents(db, dek, who.sub, stored);
    const ids = new Set(stored.map((event) => String(event.id)));
    const saved = await readEventsByIds(db, dek, who.sub, ids);

    let backedUp = false;
    const bytes = decodeBase64(input.imageBase64);
    // A photo handed over deliberately is the clearest case there is for
    // keeping the original, so the account setting decides and there is no
    // override here: the person is right there, and they can change it.
    if (bytes && (await resolveBackup(db, env, who.sub, undefined))) {
      ({ backedUp } = await keepOriginal(db, attachmentsBucket(env), dek, who.sub, {
        entryId,
        bytes,
        name: input.filename ?? 'photo.jpg',
        mimeType: input.mimeType,
      }));
    }

    return mcpJson({ events: saved, found: drafts.length, backedUp }, 201);
  } catch (error) {
    console.error('handoff save failed', error instanceof Error ? error.message : 'unknown');
    return mcpJson({ error: 'Read that, but could not save it.' }, 500);
  }
}
