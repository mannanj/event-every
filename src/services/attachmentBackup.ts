import { inputStorage } from '@/services/inputStorage';
import type { StoredInputFile } from '@/types/input';

/**
 * Client half of attachment backup.
 *
 * THE LAYERING, WHICH IS THE POINT. IndexedDB is the store of record and is
 * always read first. Nothing here runs when the browser already holds the file.
 * These calls exist for two moments only:
 *
 *   uploading   after an input-history entry is saved, if the account asked
 *               for backups
 *   restoring   when a file is wanted and IndexedDB does not have it - a new
 *               laptop, a cleared browser, an entry that aged out of the
 *               200-entry cap on one device but not another
 *
 * Every function answers with a null or an empty result rather than throwing.
 * Backup is an extra; a failure in it must never be able to break saving an
 * event, which worked before any of this existed and still has to.
 */

export interface BackedUpFile {
  id: string;
  entryId: string;
  name: string;
  mimeType: string;
  kind: 'image' | 'calendar';
  size: number;
  updatedAt: string;
}

/** Matches MAX_FILES on /api/attachments/upload. */
const UPLOAD_BATCH = 3;

export interface BackupStatus {
  enabled: boolean;
  attachments: BackedUpFile[];
  bytes: number;
}

/** Null means "cannot know": signed out, or the deployment has no bucket. */
export async function readBackupStatus(): Promise<BackupStatus | null> {
  try {
    const response = await fetch('/api/attachments', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()) as BackupStatus;
  } catch {
    return null;
  }
}

export async function setBackupEnabled(enabled: boolean): Promise<boolean | null> {
  try {
    const response = await fetch('/api/attachments/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ enabled }),
    });
    if (!response.ok) return null;
    return ((await response.json()) as { enabled: boolean }).enabled;
  } catch {
    return null;
  }
}

export async function removeAllBackups(): Promise<number | null> {
  try {
    const response = await fetch('/api/attachments/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ all: true }),
    });
    if (!response.ok) return null;
    return ((await response.json()) as { removed: number }).removed;
  } catch {
    return null;
  }
}

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Chunked, because `String.fromCharCode(...bytes)` on a multi-megabyte photo
  // blows the argument limit and throws where a plain loop would not.
  let binary = '';
  for (let at = 0; at < bytes.length; at += 8192) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
  }
  return btoa(binary);
}

/**
 * Send one entry's originals up.
 *
 * No override from a browser. The account switch decides, and the server
 * enforces it - this used to accept one, which made the setting advisory for
 * anything that could set a field. An assistant's per-call override still
 * exists, on the MCP routes, where the caller is authenticated differently and
 * is acting on an explicit instruction.
 */
export async function backupEntryFiles(
  entryId: string,
  files: readonly StoredInputFile[],
): Promise<string[]> {
  if (files.length === 0) return [];
  // Batched to the route's own limit. Sending eleven files to a route that
  // takes three fails the whole request, including the three it would have
  // accepted.
  if (files.length > UPLOAD_BATCH) {
    const done: string[] = [];
    for (let at = 0; at < files.length; at += UPLOAD_BATCH) {
      done.push(...(await backupEntryFiles(entryId, files.slice(at, at + UPLOAD_BATCH))));
    }
    return done;
  }
  try {
    const payload = await Promise.all(
      files.map(async (stored) => ({
        id: stored.id,
        name: stored.name,
        mimeType: stored.mimeType,
        kind: stored.kind,
        data: await toBase64(stored.file),
      })),
    );
    const response = await fetch('/api/attachments/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ entryId, files: payload }),
    });
    if (!response.ok) return [];
    return ((await response.json()) as { stored: string[] }).stored ?? [];
  } catch {
    return [];
  }
}

export interface BackfillProgress {
  doneBytes: number;
  totalBytes: number;
}

/**
 * Send up every original this browser holds that the account does not.
 *
 * Turning the switch on used to cover only what was saved afterwards, so the
 * history already on this device - the thing somebody turns backup on to
 * protect - never left it. Measured in bytes rather than files, because one
 * photo can be most of the work and a count would sit still through it.
 *
 * `shouldStop` is asked between batches, so turning the switch back off ends
 * the run at the next boundary instead of finishing it.
 */
export async function backfillHistory(
  alreadyBackedUp: ReadonlySet<string>,
  onProgress: (progress: BackfillProgress) => void,
  shouldStop: () => boolean,
): Promise<{ attempted: number; stored: number }> {
  const entries = await inputStorage.getAllHistory();
  const pending = entries
    .map((entry) => ({
      entryId: entry.id,
      files: entry.files.filter((file) => !alreadyBackedUp.has(file.id)),
    }))
    .filter((entry) => entry.files.length > 0);

  const totalBytes = pending.reduce(
    (sum, entry) => sum + entry.files.reduce((inner, file) => inner + file.size, 0),
    0,
  );
  const attempted = pending.reduce((sum, entry) => sum + entry.files.length, 0);
  let doneBytes = 0;
  let stored = 0;
  onProgress({ doneBytes, totalBytes });

  for (const entry of pending) {
    for (let at = 0; at < entry.files.length; at += UPLOAD_BATCH) {
      if (shouldStop()) return { attempted, stored };
      const batch = entry.files.slice(at, at + UPLOAD_BATCH);
      stored += (await backupEntryFiles(entry.entryId, batch)).length;
      doneBytes += batch.reduce((sum, file) => sum + file.size, 0);
      onProgress({ doneBytes, totalBytes });
    }
  }
  return { attempted, stored };
}

/**
 * The second layer. Called only when IndexedDB came up empty for this file.
 */
export async function restoreFile(file: BackedUpFile): Promise<StoredInputFile | null> {
  try {
    const response = await fetch(`/api/attachments/file?id=${encodeURIComponent(file.id)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    return {
      id: file.id,
      file: new File([bytes], file.name, { type: file.mimeType }),
      kind: file.kind,
      name: file.name,
      mimeType: file.mimeType,
      size: bytes.byteLength,
    };
  } catch {
    return null;
  }
}

/**
 * Everything backed up for one input-history entry, for a browser that has the
 * entry but not its files.
 */
export async function restoreEntryFiles(entryId: string): Promise<StoredInputFile[]> {
  try {
    const response = await fetch(`/api/attachments?entry=${encodeURIComponent(entryId)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) return [];
    const { attachments } = (await response.json()) as BackupStatus;
    const restored = await Promise.all(attachments.map((one) => restoreFile(one)));
    return restored.filter((one): one is StoredInputFile => one !== null);
  } catch {
    return [];
  }
}
