import { InputDraft, InputHistoryEntry } from '@/types/input';
import type { StoredInputFile } from '@/types/input';

// Internal IndexedDB name. Kept stable across the Event Every ↔ Summon renames so existing
// users keep their drafts and input history — renaming the store would orphan their data.
const DB_NAME = 'summon-input';
const DB_VERSION = 1;
const DRAFT_STORE = 'draft';
const HISTORY_STORE = 'history';
const DRAFT_KEY = 'current';
const HISTORY_LIMIT = 200;

let dbPromise: Promise<IDBDatabase | null> | null = null;

type PersistedStoredInputFile = Omit<StoredInputFile, 'file'> & {
  bytes: ArrayBuffer;
};

type LegacyStoredInputFile = Omit<StoredInputFile, 'file'> & {
  file: File | Blob;
};

type PersistedInputDraft = Omit<InputDraft, 'files'> & {
  files: PersistedStoredInputFile[];
};

type PersistedInputHistoryEntry = Omit<InputHistoryEntry, 'files'> & {
  files: PersistedStoredInputFile[];
};

export async function persistInputFiles(
  files: StoredInputFile[]
): Promise<PersistedStoredInputFile[]> {
  return Promise.all(
    files.map(async ({ file, ...metadata }) => ({
      ...metadata,
      bytes: await file.arrayBuffer(),
    }))
  );
}

export function hydrateInputFiles(
  files: Array<PersistedStoredInputFile | LegacyStoredInputFile>
): StoredInputFile[] {
  return files.map((stored) => {
    if ('bytes' in stored) {
      const { bytes, ...metadata } = stored;
      return {
        ...metadata,
        file: new File([bytes], metadata.name, { type: metadata.mimeType }),
      };
    }

    const { file, ...metadata } = stored;
    return {
      ...metadata,
      file:
        file instanceof File
          ? file
          : new File([file], metadata.name, { type: metadata.mimeType }),
    };
  });
}

async function persistDraft(draft: InputDraft): Promise<PersistedInputDraft> {
  return { ...draft, files: await persistInputFiles(draft.files) };
}

function hydrateDraft(draft: PersistedInputDraft | InputDraft): InputDraft {
  return {
    ...draft,
    files: hydrateInputFiles(
      draft.files as Array<PersistedStoredInputFile | LegacyStoredInputFile>
    ),
  };
}

async function persistHistoryEntry(
  entry: InputHistoryEntry
): Promise<PersistedInputHistoryEntry> {
  return { ...entry, files: await persistInputFiles(entry.files) };
}

function hydrateHistoryEntry(
  entry: PersistedInputHistoryEntry | InputHistoryEntry
): InputHistoryEntry {
  return {
    ...entry,
    files: hydrateInputFiles(
      entry.files as Array<PersistedStoredInputFile | LegacyStoredInputFile>
    ),
  };
}

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DRAFT_STORE)) {
          db.createObjectStore(DRAFT_STORE);
        }
        if (!db.objectStoreNames.contains(HISTORY_STORE)) {
          const store = db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }
  return dbPromise;
}

// Runs a single-store request and resolves null on any failure so that
// browser-storage being unavailable (private mode, quota) never breaks the app.
function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest
): Promise<T | null> {
  return openDB().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const transaction = db.transaction(storeName, mode);
          const request = op(transaction.objectStore(storeName));
          request.onsuccess = () => resolve(request.result as T);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

export const inputStorage = {
  async saveDraft(draft: InputDraft): Promise<unknown> {
    const persisted = await persistDraft(draft);
    return run(DRAFT_STORE, 'readwrite', (s) => s.put(persisted, DRAFT_KEY));
  },

  async getDraft(): Promise<InputDraft | null> {
    const draft = await run<PersistedInputDraft | InputDraft>(
      DRAFT_STORE,
      'readonly',
      (s) => s.get(DRAFT_KEY)
    );
    return draft ? hydrateDraft(draft) : null;
  },

  clearDraft(): Promise<unknown> {
    return run(DRAFT_STORE, 'readwrite', (s) => s.delete(DRAFT_KEY));
  },

  async getAllHistory(): Promise<InputHistoryEntry[]> {
    const all = await run<Array<PersistedInputHistoryEntry | InputHistoryEntry>>(
      HISTORY_STORE,
      'readonly',
      (s) => s.getAll()
    );
    return (all ?? [])
      .map(hydrateHistoryEntry)
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  async addHistoryEntry(entry: InputHistoryEntry): Promise<void> {
    const persisted = await persistHistoryEntry(entry);
    await run(HISTORY_STORE, 'readwrite', (s) => s.put(persisted));
    const all = await inputStorage.getAllHistory();
    if (all.length > HISTORY_LIMIT) {
      const stale = all.slice(HISTORY_LIMIT);
      await Promise.all(stale.map((e) => inputStorage.deleteHistoryEntry(e.id)));
    }
  },

  async updateHistoryEntry(id: string, patch: Partial<InputHistoryEntry>): Promise<void> {
    const stored = await run<PersistedInputHistoryEntry | InputHistoryEntry>(
      HISTORY_STORE,
      'readonly',
      (s) => s.get(id)
    );
    if (!stored) return; // evicted or never stored — nothing to patch
    const updated = { ...hydrateHistoryEntry(stored), ...patch };
    const persisted = await persistHistoryEntry(updated);
    await run(HISTORY_STORE, 'readwrite', (s) => s.put(persisted));
  },

  deleteHistoryEntry(id: string): Promise<unknown> {
    return run(HISTORY_STORE, 'readwrite', (s) => s.delete(id));
  },

  clearHistory(): Promise<unknown> {
    return run(HISTORY_STORE, 'readwrite', (s) => s.clear());
  },
};
