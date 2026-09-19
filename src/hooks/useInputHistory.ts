'use client';

import { useState, useEffect, useCallback } from 'react';
import { InputHistoryEntry } from '@/types/input';
import { inputStorage } from '@/services/inputStorage';

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
      return id;
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

  return { entries, addEntry, setSummary, refresh };
}
