import { z } from 'zod';

import { removeAttachments } from '@/server/accounts/attachments';
import { attachmentJson, requireAttachmentSession } from '@/server/accounts/attachment-session';

export const dynamic = 'force-dynamic';

/**
 * Delete attachments from the account.
 *
 * With `all`, everything: what "Delete attachments from my account" in the
 * account menu does. With ids, just those.
 *
 * This does NOT touch the browser's own copies. IndexedDB is the store of
 * record and deleting the backup is a decision about what this account keeps on
 * a server, not an instruction to wipe the person's own device.
 */
const Body = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(z.string().min(1).max(200)).min(1).max(500) }),
]);

export async function POST(request: Request) {
  const gate = await requireAttachmentSession(request);
  if (!gate.ok) return gate.response;
  const { db, bucket, account } = gate.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return attachmentJson({ error: 'Expected a JSON body.' }, 400);
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) return attachmentJson({ error: 'Remove which files?' }, 400);

  try {
    const removed = await removeAttachments(
      db,
      bucket,
      account.id,
      'all' in parsed.data ? null : parsed.data.ids,
    );
    return attachmentJson({ removed });
  } catch (error) {
    console.error('attachment remove failed', error instanceof Error ? error.message : 'unknown');
    return attachmentJson({ error: 'Could not remove those.' }, 500);
  }
}
