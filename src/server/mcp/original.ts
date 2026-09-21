import { backupEnabled, putAttachment } from '@/server/accounts/attachments';
import type { AttachmentBucket } from '@/server/accounts/attachments';
import type { D1Like } from '@/server/accounts/d1';
import { attachmentsConfigured, type AccountsEnv } from '@/server/accounts/env';

/**
 * Keeping the words an assistant sent, next to the events they became.
 *
 * WHAT AN MCP CALL CAN BACK UP. Not a photograph: a model cannot emit a
 * megabyte of accurate base64 as a tool argument, and no host forwards an
 * attached file to a remote MCP server. What it can hand over is the text it
 * was given, and that is worth keeping - it is the thing somebody would want to
 * check when an extracted date looks wrong six weeks later. It is stored as an
 * `original-text` attachment, the same kind the browser writes.
 *
 * THE THREE STATES, RESOLVED HERE AND NOWHERE ELSE.
 *
 *   undefined   follow the account's own setting
 *   true        keep it, even when the account setting is off
 *   false       skip it, even when the account setting is on
 *
 * An override applies to ONE call and never writes back to the account. The
 * switch in the account menu answers "what should normally happen"; a single
 * request can have a reason that setting cannot know, in either direction. What
 * an override cannot do is conjure a bucket: a deployment with no R2 binding
 * stores nothing whatever anyone passes.
 */

export type BackupChoice = boolean | undefined;

export interface OriginalBackup {
  backedUp: boolean;
}

/**
 * Bounded. An image is allowed the scanner's own ceiling, because that is what
 * the browser would have stored; text and calendar files are held far tighter,
 * since a novel is not provenance.
 */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_BYTES = 1024 * 1024;

export async function resolveBackup(
  db: D1Like,
  env: AccountsEnv,
  accountId: string,
  choice: BackupChoice,
): Promise<boolean> {
  if (!attachmentsConfigured(env)) return false;
  if (choice !== undefined) return choice;
  return backupEnabled(db, accountId);
}

/**
 * Store the submitted text against the input-history entry these events share.
 *
 * Failure here is swallowed on purpose. The events are already saved and that
 * is what the caller asked for; losing the provenance copy is a smaller harm
 * than turning a successful save into an error, and the return value reports
 * honestly whether it happened.
 */
export async function keepOriginal(
  db: D1Like,
  bucket: AttachmentBucket,
  dek: CryptoKey,
  accountId: string,
  input: { entryId: string; bytes: Uint8Array; name: string; mimeType: string },
): Promise<OriginalBackup> {
  const isImage = input.mimeType.startsWith('image/');
  const ceiling = isImage ? MAX_IMAGE_BYTES : MAX_TEXT_BYTES;
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > ceiling) {
    return { backedUp: false };
  }

  try {
    await putAttachment(db, bucket, dek, accountId, {
      id: `${input.entryId}-original`,
      entryId: input.entryId,
      bytes: input.bytes,
      name: input.name,
      mimeType: input.mimeType,
      // The input-history kinds are 'image' and 'calendar', which is what the
      // browser's hydration path knows how to read. Text and .ics both ride as
      // 'calendar' rather than growing a third kind that path has never seen;
      // the mime type is what actually distinguishes them.
      kind: isImage ? 'image' : 'calendar',
    });
    return { backedUp: true };
  } catch (error) {
    console.error('original backup failed', error instanceof Error ? error.message : 'unknown');
    return { backedUp: false };
  }
}
