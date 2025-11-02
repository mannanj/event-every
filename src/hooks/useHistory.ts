import { useState, useEffect, useCallback } from 'react';
import { CalendarEvent } from '@/types/event';
import { eventStorage } from '@/services/storage';

export interface UseHistoryResult {
  events: CalendarEvent[];
  isLoading: boolean;
  error: string | null;
  addEvent: (event: CalendarEvent) => void;
  deleteEvent: (id: string) => void;
  clearHistory: () => void;
  searchEvents: (query: string) => void;
  refreshEvents: () => void;
}

export const useHistory = (): UseHistoryResult => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadEvents = useCallback(() => {
    setIsLoading(true);
    setError(null);

    const result = searchQuery
      ? eventStorage.searchEvents(searchQuery)
      : eventStorage.getAllEvents();

    if (result.success && result.data) {
      setEvents(result.data);
    } else {
      setError(result.error || 'Failed to load events');
      setEvents([]);
    }

    setIsLoading(false);
  }, [searchQuery]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const addEvent = useCallback(
    (event: CalendarEvent) => {
      const result = eventStorage.saveEvent(event);

      if (result.success) {
        loadEvents();
      } else {
        setError(result.error || 'Failed to save event');
      }
    },
    [loadEvents]
  );

  const deleteEvent = useCallback(
    (id: string) => {
      const result = eventStorage.deleteEvent(id);

      if (result.success) {
        loadEvents();
      } else {
        setError(result.error || 'Failed to delete event');
      }
    },
    [loadEvents]
  );

  const clearHistory = useCallback(() => {
    const result = eventStorage.clearHistory();

    if (result.success) {
      setEvents([]);
      setError(null);
    } else {
      setError(result.error || 'Failed to clear history');
    }
  }, []);

  const searchEvents = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const refreshEvents = useCallback(() => {
    loadEvents();
  }, [loadEvents]);

  return {
    events,
    isLoading,
    error,
    addEvent,
    deleteEvent,
    clearHistory,
    searchEvents,
    refreshEvents,
  };
};
