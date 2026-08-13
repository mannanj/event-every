import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  hydrateInputFiles,
  inputStorage,
  persistInputFiles,
  setInputStorageDatabaseForTests,
} from '@/services/inputStorage';
import { createHistoryEntryId } from '@/services/requestId';
import type { StoredInputFile } from '@/types/input';

function storedFile(overrides: Partial<StoredInputFile> = {}): StoredInputFile {
  return {
    id: 'file-1',
    file: new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'flyer.png', {
      type: 'image/png',
    }),
    kind: 'image',
    name: 'flyer.png',
    mimeType: 'image/png',
    size: 4,
    ...overrides,
  };
}

describe('input storage file DTO', () => {
  test('round-trips bytes and metadata without persisting File objects', async () => {
    const persisted = await persistInputFiles([
      storedFile({ eventCount: 3 }),
    ]);

    expect(persisted).toHaveLength(1);
    expect(persisted[0]).not.toHaveProperty('file');
    expect(persisted[0]?.bytes).toBeInstanceOf(ArrayBuffer);

    const [hydrated] = hydrateInputFiles(persisted);
    expect(hydrated?.file).toBeInstanceOf(File);
    expect(hydrated?.file.name).toBe('flyer.png');
    expect(hydrated?.file.type).toBe('image/png');
    expect(hydrated?.kind).toBe('image');
    expect(hydrated?.eventCount).toBe(3);
    expect([...new Uint8Array(await hydrated!.file.arrayBuffer())]).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
  });

  test('hydrates legacy Blob records without changing public metadata', async () => {
    const [hydrated] = hydrateInputFiles([
      {
        id: 'legacy-1',
        file: new Blob(['BEGIN:VCALENDAR'], { type: 'text/calendar' }),
        kind: 'calendar',
        name: 'legacy.ics',
        mimeType: 'text/calendar',
        size: 15,
        eventCount: 1,
      },
    ]);

    expect(hydrated?.file).toBeInstanceOf(File);
    expect(hydrated?.file.name).toBe('legacy.ics');
    expect(hydrated?.file.type).toBe('text/calendar');
    expect(hydrated?.eventCount).toBe(1);
    expect(await hydrated?.file.text()).toBe('BEGIN:VCALENDAR');
  });
});

afterEach(() => setInputStorageDatabaseForTests(undefined));

test('upgrades the stable database with the provider operation store', () => {
  const source = readFileSync('src/services/inputStorage.ts', 'utf8');
  expect(source).toContain("const DB_VERSION = 2");
  expect(source).toContain("const PROVIDER_OPERATION_STORE = 'provider-operations'");
  expect(source).toContain("createObjectStore(PROVIDER_OPERATION_STORE, { keyPath: 'requestId' })");
});

test('provider operation writes resolve only after transaction completion', async () => {
  const request = {} as IDBRequest;
  const transaction = {
    oncomplete: null as ((event: Event) => void) | null,
    onabort: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    error: null,
    objectStore: () => ({ put: () => request }),
  };
  const database = { transaction: () => transaction } as unknown as IDBDatabase;
  setInputStorageDatabaseForTests(database);
  let settled = false;
  const pending = inputStorage.saveProviderOperationRecord({ requestId: 'one' }).then(() => { settled = true; });
  await Promise.resolve();
  expect(settled).toBe(false);
  const transactionComplete = () => transaction.oncomplete?.(new Event('complete'));
  transactionComplete();
  await pending;
  expect(settled).toBe(true);
});

test('provider operation transaction abort rejects', async () => {
  const request = {} as IDBRequest;
  const transaction = {
    oncomplete: null as ((event: Event) => void) | null,
    onabort: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    error: new DOMException('quota', 'AbortError'),
    objectStore: () => ({ put: () => request }),
  };
  setInputStorageDatabaseForTests({ transaction: () => transaction } as unknown as IDBDatabase);
  const pending = inputStorage.saveProviderOperationRecord({ requestId: 'one' });
  await Promise.resolve();
  transaction.onabort?.(new Event('abort'));
  await expect(pending).rejects.toThrow();
});

test('provider operation reads fail closed when storage cannot be opened', async () => {
  setInputStorageDatabaseForTests({
    transaction: () => { throw new DOMException('blocked', 'InvalidStateError'); },
  } as unknown as IDBDatabase);
  await expect(inputStorage.getAllProviderOperationRecords()).rejects.toThrow('blocked');
});

test('new history IDs are UUIDs while legacy IDs remain readable', async () => {
  expect(createHistoryEntryId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const request = {
    result: [{ id: 'ih-legacy-timestamp-id', createdAt: 1, text: 'Legacy', files: [], source: 'text' }],
    onsuccess: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null,
  };
  const database = {
    transaction: () => ({ objectStore: () => ({ getAll: () => {
      queueMicrotask(() => request.onsuccess?.(new Event('success')));
      return request;
    } }) }),
  } as unknown as IDBDatabase;
  setInputStorageDatabaseForTests(database);
  await expect(inputStorage.getAllHistory()).resolves.toEqual([
    { id: 'ih-legacy-timestamp-id', createdAt: 1, text: 'Legacy', files: [], source: 'text' },
  ]);
});
