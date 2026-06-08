import { InputDraft, InputHistoryEntry } from '@/types/input';

const DB_NAME = 'summon-input';
const DB_VERSION = 1;
const DRAFT_STORE = 'draft';
const HISTORY_STORE = 'history';
const DRAFT_KEY = 'current';
const HISTORY_LIMIT = 200;

let dbPromise: Promise<IDBDatabase | null> | null = null;

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
  saveDraft(draft: InputDraft): Promise<unknown> {
    return run(DRAFT_STORE, 'readwrite', (s) => s.put(draft, DRAFT_KEY));
  },

  getDraft(): Promise<InputDraft | null> {
    return run<InputDraft>(DRAFT_STORE, 'readonly', (s) => s.get(DRAFT_KEY));
  },

  clearDraft(): Promise<unknown> {
    return run(DRAFT_STORE, 'readwrite', (s) => s.delete(DRAFT_KEY));
  },

  async getAllHistory(): Promise<InputHistoryEntry[]> {
    const all = await run<InputHistoryEntry[]>(HISTORY_STORE, 'readonly', (s) => s.getAll());
    return (all ?? []).sort((a, b) => b.createdAt - a.createdAt);
  },

  async addHistoryEntry(entry: InputHistoryEntry): Promise<void> {
    await run(HISTORY_STORE, 'readwrite', (s) => s.put(entry));
    const all = await inputStorage.getAllHistory();
    if (all.length > HISTORY_LIMIT) {
      const stale = all.slice(HISTORY_LIMIT);
      await Promise.all(stale.map((e) => inputStorage.deleteHistoryEntry(e.id)));
    }
  },

  deleteHistoryEntry(id: string): Promise<unknown> {
    return run(HISTORY_STORE, 'readwrite', (s) => s.delete(id));
  },

  clearHistory(): Promise<unknown> {
    return run(HISTORY_STORE, 'readwrite', (s) => s.clear());
  },
};
