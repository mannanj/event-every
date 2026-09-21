import { z } from 'zod';

import { backupEnabled, setBackupEnabled } from '@/server/accounts/attachments';
import { attachmentJson, requireAttachmentSession } from '@/server/accounts/attachment-session';

export const dynamic = 'force-dynamic';

const Body = z.object({ enabled: z.boolean() });

/**
 * Turn "back up attachments to my account" on or off.
 *
 * Turning it OFF deliberately leaves what is already stored alone. Off means
 * "stop uploading", and a switch that also quietly destroyed a year of
 * originals would be a trap. Removing them is the other menu item, which says
 * so and asks first.
 */
export async function POST(request: Request) {
  const gate = await requireAttachmentSession(request);
  if (!gate.ok) return gate.response;
  const { db, account } = gate.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return attachmentJson({ error: 'Expected a JSON body.' }, 400);
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) return attachmentJson({ error: 'On or off?' }, 400);

  try {
    await setBackupEnabled(db, account.id, parsed.data.enabled);
    return attachmentJson({ enabled: await backupEnabled(db, account.id) });
  } catch (error) {
    console.error('attachment setting failed', error instanceof Error ? error.message : 'unknown');
    return attachmentJson({ error: 'Could not change that.' }, 500);
  }
}
