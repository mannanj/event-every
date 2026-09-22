import { z } from 'zod';

import { backupEnabled, putAttachment } from '@/server/accounts/attachments';
import { attachmentJson, requireAttachmentSession } from '@/server/accounts/attachment-session';

export const dynamic = 'force-dynamic';

/**
 * Back up the originals for one input-history entry.
 *
 * BASE64 IN JSON, not multipart, because the edge admission policy admits one
 * media type per route and every other route here is JSON. A third of overhead
 * on the wire is the price; the alternative is a second content-type path
 * through the one layer that is meant to be uniform.
 *
 * The account setting is checked SERVER-SIDE. A client that stopped asking, or
 * a stale tab that never heard the switch was turned off, must not be able to
 * upload anyway - the switch is a decision about the account, not a hint to
 * the browser.
 */

/**
 * Fifteen megabytes a file, three a request.
 *
 * The per-file figure is the one that matters to a person: a modern phone
 * photograph is comfortably under it. The per-request count came DOWN from ten
 * when the size went up, because base64 adds a third and ten fifteen-megabyte
 * files would be roughly two hundred megabytes on the wire - past what a Worker
 * will accept, so the whole batch would fail rather than the eleventh file.
 */
const MAX_FILES = 3;
const MAX_FILE_BYTES = 15 * 1024 * 1024;

const Incoming = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(300),
  mimeType: z.string().min(1).max(200),
  kind: z.enum(['image', 'calendar']),
  data: z.string().min(1),
});

const Body = z.object({
  entryId: z.string().min(1).max(200),
  files: z.array(Incoming).min(1).max(MAX_FILES),
  /**
   * REMOVED, deliberately.
   *
   * This route is reached by a browser carrying a session cookie, and it used
   * to accept `override: true` from the request body - directly under a comment
   * saying the switch "is not a hint to the browser". Any page, or any stale
   * tab, could set it and upload with the switch off. The setting was
   * advisory after all.
   *
   * The MCP tools still take an override, because an assistant is a different
   * caller with a different reason: it is acting on an explicit instruction for
   * one call. That path goes through /api/mcp/*, which is reached with a signed
   * actor token rather than a cookie, and resolves the choice in
   * server/mcp/original.ts. A browser has the switch, and the switch is enough.
   */
});

function decode(base64: string): Uint8Array | null {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
    return bytes;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const gate = await requireAttachmentSession(request);
  if (!gate.ok) return gate.response;
  const { db, bucket, dek, account } = gate.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return attachmentJson({ error: 'Expected a JSON body.' }, 400);
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) return attachmentJson({ error: 'That is not a usable file.' }, 400);

  if (!(await backupEnabled(db, account.id))) {
    return attachmentJson({ error: 'Attachment backup is off for this account.', skipped: true }, 409);
  }

  const stored: string[] = [];
  try {
    for (const file of parsed.data.files) {
      const bytes = decode(file.data);
      if (!bytes) return attachmentJson({ error: 'That file could not be read.' }, 400);
      if (bytes.byteLength > MAX_FILE_BYTES) {
        return attachmentJson({ error: 'That file is too large to back up.' }, 413);
      }
      await putAttachment(db, bucket, dek, account.id, {
        id: file.id,
        entryId: parsed.data.entryId,
        bytes,
        name: file.name,
        mimeType: file.mimeType,
        kind: file.kind,
      });
      stored.push(file.id);
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'attachment_quota_exceeded') {
      return attachmentJson(
        { error: 'This account is out of backup space. Remove some files first.', stored },
        507,
      );
    }
    console.error('attachment upload failed', error instanceof Error ? error.message : 'unknown');
    // Partial success is reported honestly rather than rolled back: the files
    // already stored are genuinely stored, and a client that retries the whole
    // entry overwrites them by id rather than duplicating.
    return attachmentJson({ error: 'Could not store all of those.', stored }, 500);
  }

  return attachmentJson({ stored }, 201);
}
