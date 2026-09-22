'use client';

import { useState, useEffect, useCallback } from 'react';
import { InputHistoryEntry } from '@/types/input';
import { inputStorage } from '@/services/inputStorage';
import { backupEntryFiles, readBackupStatus, restoreEntryFiles } from '@/services/attachmentBackup';

/**
 * Input history, with a second layer underneath it.
 *
 * INDEXEDDB IS THE STORE OF RECORD and is read first, always. The account
 * backup is consulted in exactly two moments and no others:
 *
 *   on save     the originals go up, if the account asked for that
 *   on a miss   a file is wanted and this browser does not have it
 *
 * A browser that already holds a file never makes a request, which is the whole
 * point: the history stays instant, and the network is only ever the fallback.
 */
export function useInputHistory() {
  const [entries, setEntries] = useState<InputHistoryEntry[]>([]);

  const refresh = useCallback(async () => {
    const all = await inputStorage.getAllHistory();
    setEntries(all);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Resolves to the id that survived: an input identical to one already stored
  // reuses that entry rather than adding a second row, and the caller needs the
  // surviving id to hang the summary on.
  const addEntry = useCallback(
    async (entry: InputHistoryEntry): Promise<string> => {
      const id = await inputStorage.addHistoryEntry(entry);
      await refresh();

      // ASK BEFORE SENDING, and the order here is the whole point.
      //
      // This used to call backupEntryFiles unconditionally, on the reasoning
      // that the server refuses when the switch is off. It does - but it
      // refuses AFTER the request arrives, and the request is the photograph.
      // So a signed-out visitor's picture left their device on every save, up
      // to ten files of six megabytes each, to be answered 401 and discarded.
      // "A no-op for most people" was true of the effect and false of the only
      // part that mattered.
      //
      // readBackupStatus answers null when signed out or unconfigured, and
      // `enabled` false when the switch is off. Either way nothing is encoded
      // and nothing is sent.
      if (entry.files.length > 0) {
        void (async () => {
          const status = await readBackupStatus();
          if (status?.enabled !== true) return;
          // NOT AWAITED BY THE CALLER. The save has already succeeded and the
          // person is waiting to see their events; making them wait on a
          // backup would be charging them for it. Errors cannot escape either -
          // backupEntryFiles catches everything and answers [], because a
          // failed backup must never turn a successful save into a visible
          // error.
          await backupEntryFiles(id, entry.files);
        })();
      }

      return id;
    },
    [refresh]
  );

  /**
   * An entry with its files, fetching them only if this browser lacks them.
   *
   * The miss is real rather than theoretical: the history is capped at 200
   * entries per device, so an entry can survive on a phone and be gone from a
   * laptop, and a fresh sign-in starts with nothing at all.
   *
   * Restored files are written back into IndexedDB, so the second look is local
   * again. Returns the entry unchanged when there is nothing to restore, which
   * is also what a deployment without a bucket does.
   */
  const ensureFiles = useCallback(
    async (entry: InputHistoryEntry): Promise<InputHistoryEntry> => {
      if (entry.files.length > 0) return entry;

      const files = await restoreEntryFiles(entry.id);
      if (files.length === 0) return entry;

      const hydrated = { ...entry, files };
      await inputStorage.updateHistoryEntry(entry.id, { files });
      await refresh();
      return hydrated;
    },
    [refresh]
  );

  const setSummary = useCallback(
    async (id: string, summary: string) => {
      await inputStorage.updateHistoryEntry(id, { summary });
      await refresh();
    },
    [refresh]
  );

  return { entries, addEntry, ensureFiles, setSummary, refresh };
}
