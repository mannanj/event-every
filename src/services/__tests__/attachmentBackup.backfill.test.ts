import { afterEach, describe, expect, test } from 'bun:test';

import { backfillHistory, type BackfillProgress } from '@/services/attachmentBackup';
import { inputStorage } from '@/services/inputStorage';
import type { InputHistoryEntry, StoredInputFile } from '@/types/input';

const realFetch = globalThis.fetch;
const realGetAll = inputStorage.getAllHistory;
let uploads: { entryId: string; ids: string[] }[] = [];

function file(id: string, size: number): StoredInputFile {
  return {
    id,
    file: new File([new Uint8Array(size)], `${id}.jpg`, { type: 'image/jpeg' }),
    kind: 'image',
    name: `${id}.jpg`,
    mimeType: 'image/jpeg',
    size,
  };
}

function entry(id: string, files: StoredInputFile[]): InputHistoryEntry {
  return { id, createdAt: 0, text: '', files, source: 'image' };
}

function setup(entries: InputHistoryEntry[], refuse: ReadonlySet<string> = new Set()) {
  uploads = [];
  inputStorage.getAllHistory = async () => entries;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { entryId: string; files: { id: string }[] };
    const ids = body.files.map((f) => f.id);
    uploads.push({ entryId: body.entryId, ids });
    return new Response(JSON.stringify({ stored: ids.filter((id) => !refuse.has(id)) }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  inputStorage.getAllHistory = realGetAll;
});

describe('backing up what the browser already has', () => {
  test('sends only what the account lacks, in batches the route accepts, to 100%', async () => {
    setup([
      entry('a', [file('a1', 10), file('a2', 10), file('a3', 10), file('a4', 10)]),
      entry('b', [file('b1', 60)]),
      entry('c', []),
    ]);
    const seen: BackfillProgress[] = [];

    const result = await backfillHistory(new Set(['a2']), (p) => seen.push(p), () => false);

    expect(uploads).toEqual([
      { entryId: 'a', ids: ['a1', 'a3', 'a4'] },
      { entryId: 'b', ids: ['b1'] },
    ]);
    expect(result).toEqual({ attempted: 4, stored: 4 });
    expect(seen[0]).toEqual({ doneBytes: 0, totalBytes: 90 });
    expect(seen.at(-1)).toEqual({ doneBytes: 90, totalBytes: 90 });
  });

  test('counts what the server refused, so the menu can say so', async () => {
    setup([entry('a', [file('a1', 5), file('big', 5)])], new Set(['big']));
    const result = await backfillHistory(new Set(), () => {}, () => false);
    expect(result).toEqual({ attempted: 2, stored: 1 });
  });

  test('stops at the next batch once the switch goes off', async () => {
    setup([entry('a', [file('a1', 1), file('a2', 1), file('a3', 1), file('a4', 1)])]);
    let stop = false;
    await backfillHistory(new Set(), () => {}, () => {
      const was = stop;
      stop = true;
      return was;
    });
    expect(uploads).toHaveLength(1);
  });

  test('nothing to send still reports a finished run', async () => {
    setup([entry('a', [file('a1', 5)])]);
    const seen: BackfillProgress[] = [];
    await backfillHistory(new Set(['a1']), (p) => seen.push(p), () => false);
    expect(uploads).toHaveLength(0);
    expect(seen).toEqual([{ doneBytes: 0, totalBytes: 0 }]);
  });
});
