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

  const addEntry = useCallback(
    async (entry: InputHistoryEntry) => {
      await inputStorage.addHistoryEntry(entry);
      await refresh();
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
