import { afterEach, describe, expect, test } from 'bun:test';

import {
  backupEntryFiles,
  readBackupStatus,
  removeAllBackups,
  restoreFile,
  setBackupEnabled,
} from '@/services/attachmentBackup';
import type { StoredInputFile } from '@/types/input';

/**
 * The client half, against a stubbed fetch.
 *
 * The behaviour worth pinning is what happens when the server is unhappy.
 * Backup is an extra bolted onto an app that worked without it, so every
 * failure here has to come back as "no" rather than as an exception that
 * escapes into whatever was saving an event at the time.
 */

const realFetch = globalThis.fetch;
let calls: { url: string; init?: RequestInit }[] = [];

function stub(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function storedFile(id: string, bytes: number[]): StoredInputFile {
  return {
    id,
    file: new File([new Uint8Array(bytes)], 'poster.jpg', { type: 'image/jpeg' }),
    kind: 'image',
    name: 'poster.jpg',
    mimeType: 'image/jpeg',
    size: bytes.length,
  };
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('reading the status', () => {
  test('returns what the server said', async () => {
    stub(() => json({ enabled: true, attachments: [], bytes: 0 }));
    expect(await readBackupStatus()).toEqual({ enabled: true, attachments: [], bytes: 0 });
  });

  test('a signed-out browser gets null, not a throw', async () => {
    stub(() => json({ error: 'Not signed in.' }, 401));
    expect(await readBackupStatus()).toBeNull();
  });

  test('a deployment with no bucket gets null', async () => {
    stub(() => json({ error: 'Attachment backup is not available.' }, 503));
    expect(await readBackupStatus()).toBeNull();
  });

  test('a network failure gets null', async () => {
    stub(() => {
      throw new Error('offline');
    });
    expect(await readBackupStatus()).toBeNull();
  });
});

describe('the switch', () => {
  test('sends the wanted value and returns the server’s answer', async () => {
    stub(() => json({ enabled: true }));
    expect(await setBackupEnabled(true)).toBe(true);
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({ enabled: true });
  });

  test('a refusal reads as null so the caller can put the tick back', async () => {
    stub(() => json({ error: 'nope' }, 500));
    expect(await setBackupEnabled(true)).toBeNull();
  });
});

describe('uploading', () => {
  test('sends base64 and the entry it belongs to', async () => {
    stub(() => json({ stored: ['file-1'] }, 201));
    const saved = await backupEntryFiles('entry-1', [storedFile('file-1', [1, 2, 3])]);

    expect(saved).toEqual(['file-1']);
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.entryId).toBe('entry-1');
    expect(body.files[0].id).toBe('file-1');
    expect(body.files[0].data).toBe(btoa('\x01\x02\x03'));
    // Not sent unless asked for: the account setting is the default, and the
    // server decides. An override has to be deliberate.
    expect(body.override).toBeUndefined();
  });

  test('an override is passed through when it is meant', async () => {
    stub(() => json({ stored: ['file-1'] }, 201));
    await backupEntryFiles('entry-1', [storedFile('file-1', [1])], { override: true });
    expect(JSON.parse(String(calls[0]!.init!.body)).override).toBe(true);
  });

  test('nothing to upload makes no request at all', async () => {
    stub(() => json({ stored: [] }));
    expect(await backupEntryFiles('entry-1', [])).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  test('a refusal is an empty list, never a throw', async () => {
    // The caller is a save that has already succeeded locally. Backup failing
    // must not turn that into an error the person sees.
    stub(() => json({ error: 'Attachment backup is off for this account.' }, 409));
    expect(await backupEntryFiles('entry-1', [storedFile('file-1', [1])])).toEqual([]);
  });

  test('a file larger than the chunk size still encodes', async () => {
    // 8192 is the chunk boundary in the base64 helper, and the reason it is
    // chunked at all: spreading a multi-megabyte array into fromCharCode
    // throws where a loop does not.
    stub(() => json({ stored: ['big'] }, 201));
    const bytes = Array.from({ length: 20_000 }, (_, at) => at % 256);
    await backupEntryFiles('entry-1', [storedFile('big', bytes)]);

    const sent = JSON.parse(String(calls[0]!.init!.body)).files[0].data as string;
    expect(atob(sent).length).toBe(20_000);
    expect(atob(sent).charCodeAt(19_999)).toBe(19_999 % 256);
  });
});

describe('restoring', () => {
  test('rebuilds a File from the bytes the server returned', async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    stub(() => new Response(bytes, { headers: { 'Content-Type': 'image/jpeg' } }));

    const restored = await restoreFile({
      id: 'file-1',
      entryId: 'entry-1',
      name: 'poster.jpg',
      mimeType: 'image/jpeg',
      kind: 'image',
      size: 3,
      updatedAt: '2026-09-21T00:00:00.000Z',
    });

    expect(restored).not.toBeNull();
    expect(restored!.name).toBe('poster.jpg');
    expect(restored!.size).toBe(3);
    expect(Array.from(new Uint8Array(await restored!.file.arrayBuffer()))).toEqual([9, 8, 7]);
  });

  test('a file the account does not have reads as null', async () => {
    stub(() => json({ error: 'No such file.' }, 404));
    const restored = await restoreFile({
      id: 'gone',
      entryId: 'entry-1',
      name: 'poster.jpg',
      mimeType: 'image/jpeg',
      kind: 'image',
      size: 3,
      updatedAt: '2026-09-21T00:00:00.000Z',
    });
    expect(restored).toBeNull();
  });
});

describe('removing everything', () => {
  test('asks for all of them and reports the count', async () => {
    stub(() => json({ removed: 4 }));
    expect(await removeAllBackups()).toBe(4);
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({ all: true });
  });

  test('a refusal reads as null rather than as zero removed', async () => {
    // Zero would be indistinguishable from "there was nothing to remove", and
    // the menu would report success for a call that failed.
    stub(() => json({ error: 'nope' }, 500));
    expect(await removeAllBackups()).toBeNull();
  });
});
