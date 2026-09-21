import { backupEnabled, listAttachments } from '@/server/accounts/attachments';
import { attachmentJson, requireAttachmentSession } from '@/server/accounts/attachment-session';

export const dynamic = 'force-dynamic';

/**
 * What this account has backed up, and whether backup is on.
 *
 * Metadata only. The bytes are one more request each, because a browser that
 * already holds a file in IndexedDB must never download it again - this is the
 * list it compares against to find the ones it is missing.
 */
export async function GET(request: Request) {
  const gate = await requireAttachmentSession(request);
  if (!gate.ok) return gate.response;
  const { db, dek, account } = gate.context;

  const entryId = new URL(request.url).searchParams.get('entry');

  try {
    const [enabled, attachments] = await Promise.all([
      backupEnabled(db, account.id),
      listAttachments(db, dek, account.id, { entryId }),
    ]);
    return attachmentJson({
      enabled,
      attachments,
      bytes: attachments.reduce((total, one) => total + one.size, 0),
    });
  } catch (error) {
    console.error('attachment list failed', error instanceof Error ? error.message : 'unknown');
    return attachmentJson({ error: 'Could not read your backups.' }, 500);
  }
}
