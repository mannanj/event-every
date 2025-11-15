import { useState, useEffect, useCallback } from 'react';
import { CalendarEvent, EventSortOption, DateRange } from '@/types/event';
import { eventStorage } from '@/services/storage';

export interface UseHistoryResult {
  events: CalendarEvent[];
  isLoading: boolean;
  error: string | null;
  sortOption: EventSortOption;
  dateRange: DateRange | null;
  addEvent: (event: CalendarEvent) => void;
  addEvents: (events: CalendarEvent[]) => void;
  updateEvent: (event: CalendarEvent) => void;
  deleteEvent: (id: string) => void;
  clearHistory: () => void;
  searchEvents: (query: string) => void;
  refreshEvents: () => void;
  setSortOption: (option: EventSortOption) => void;
  setDateRange: (range: DateRange | null) => void;
}

const sortEvents = (events: CalendarEvent[], sortOption: EventSortOption, dateRange: DateRange | null): CalendarEvent[] => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  let filtered = [...events];

  if (sortOption === 'today') {
    filtered = filtered.filter(event => {
      const eventDate = new Date(event.startDate);
      return eventDate >= todayStart && eventDate < todayEnd;
    });
  } else if (sortOption === 'custom-range' && dateRange) {
    filtered = filtered.filter(event => {
      const eventDate = new Date(event.startDate);
      return eventDate >= dateRange.start && eventDate <= dateRange.end;
    });
  }

  filtered.sort((a, b) => {
    switch (sortOption) {
      case 'upcoming':
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      case 'created-newest':
        return new Date(b.created).getTime() - new Date(a.created).getTime();
      case 'created-oldest':
        return new Date(a.created).getTime() - new Date(b.created).getTime();
      case 'today':
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      case 'custom-range':
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      default:
        return 0;
    }
  });

  return filtered;
};

export const useHistory = (): UseHistoryResult => {
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOption, setSortOptionState] = useState<EventSortOption>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('event-sort-option');
      return (saved as EventSortOption) || 'created-newest';
    }
    return 'created-newest';
  });
  const [dateRange, setDateRangeState] = useState<DateRange | null>(null);

  const loadEvents = useCallback(() => {
    setIsLoading(true);
    setError(null);

    const result = searchQuery
      ? eventStorage.searchEvents(searchQuery)
      : eventStorage.getAllEvents();

    if (result.success && result.data) {
      setAllEvents(result.data);
    } else {
      setError(result.error || 'Failed to load events');
      setAllEvents([]);
    }

    setIsLoading(false);
  }, [searchQuery]);

  useEffect(() => {
    const sorted = sortEvents(allEvents, sortOption, dateRange);
    setEvents(sorted);
  }, [allEvents, sortOption, dateRange]);

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

  const addEvents = useCallback(
    (events: CalendarEvent[]) => {
      const result = eventStorage.saveEvents(events);

      if (result.success) {
        loadEvents();
      } else {
        setError(result.error || 'Failed to save events');
      }
    },
    [loadEvents]
  );

  const updateEvent = useCallback(
    (event: CalendarEvent) => {
      const result = eventStorage.updateEvent(event);

      if (result.success) {
        loadEvents();
      } else {
        setError(result.error || 'Failed to update event');
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

  const setSortOption = useCallback((option: EventSortOption) => {
    setSortOptionState(option);
    if (typeof window !== 'undefined') {
      localStorage.setItem('event-sort-option', option);
    }
  }, []);

  const setDateRange = useCallback((range: DateRange | null) => {
    setDateRangeState(range);
  }, []);

  return {
    events,
    isLoading,
    error,
    sortOption,
    dateRange,
    addEvent,
    addEvents,
    updateEvent,
    deleteEvent,
    clearHistory,
    searchEvents,
    refreshEvents,
    setSortOption,
    setDateRange,
  };
};
