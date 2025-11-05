import { CalendarEvent } from '@/types/event';

const STORAGE_KEY = 'event_every_history';
const TEMP_UNSAVED_EVENTS_KEY = 'event_every_temp_unsaved';

export interface StorageResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export const eventStorage = {
  saveEvent: (event: CalendarEvent): StorageResult<void> => {
    try {
      const existingEvents = eventStorage.getAllEvents().data || [];
      const updatedEvents = [event, ...existingEvents];

      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedEvents));

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save event',
      };
    }
  },

  saveEvents: (events: CalendarEvent[]): StorageResult<void> => {
    try {
      if (events.length === 0) {
        return { success: true };
      }

      const existingEvents = eventStorage.getAllEvents().data || [];
      const updatedEvents = [...events, ...existingEvents];

      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedEvents));

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save events',
      };
    }
  },

  updateEvent: (event: CalendarEvent): StorageResult<void> => {
    try {
      const result = eventStorage.getAllEvents();

      if (!result.success || !result.data) {
        return { success: false, error: result.error };
      }

      const updatedEvents = result.data.map((e) => (e.id === event.id ? event : e));

      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedEvents));

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update event',
      };
    }
  },

  getAllEvents: (): StorageResult<CalendarEvent[]> => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);

      if (!data) {
        return { success: true, data: [] };
      }

      const events = JSON.parse(data) as CalendarEvent[];

      const parsedEvents = events.map((event) => ({
        ...event,
        startDate: new Date(event.startDate),
        endDate: new Date(event.endDate),
        created: new Date(event.created),
      }));

      return { success: true, data: parsedEvents };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load events',
        data: [],
      };
    }
  },

  getEventById: (id: string): StorageResult<CalendarEvent | null> => {
    try {
      const result = eventStorage.getAllEvents();

      if (!result.success || !result.data) {
        return { success: false, error: result.error };
      }

      const event = result.data.find((e) => e.id === id);

      return { success: true, data: event || null };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to find event',
      };
    }
  },

  deleteEvent: (id: string): StorageResult<void> => {
    try {
      const result = eventStorage.getAllEvents();

      if (!result.success || !result.data) {
        return { success: false, error: result.error };
      }

      const updatedEvents = result.data.filter((event) => event.id !== id);

      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedEvents));

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete event',
      };
    }
  },

  clearHistory: (): StorageResult<void> => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear history',
      };
    }
  },

  searchEvents: (query: string): StorageResult<CalendarEvent[]> => {
    try {
      const result = eventStorage.getAllEvents();

      if (!result.success || !result.data) {
        return { success: false, error: result.error, data: [] };
      }

      if (!query.trim()) {
        return { success: true, data: result.data };
      }

      const lowercaseQuery = query.toLowerCase();

      const filteredEvents = result.data.filter((event) => {
        return (
          event.title.toLowerCase().includes(lowercaseQuery) ||
          event.location?.toLowerCase().includes(lowercaseQuery) ||
          event.description?.toLowerCase().includes(lowercaseQuery)
        );
      });

      return { success: true, data: filteredEvents };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search events',
        data: [],
      };
    }
  },

  saveTempUnsavedEvents: (events: CalendarEvent[]): StorageResult<void> => {
    try {
      localStorage.setItem(TEMP_UNSAVED_EVENTS_KEY, JSON.stringify(events));
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save temporary events',
      };
    }
  },

  getTempUnsavedEvents: (): StorageResult<CalendarEvent[]> => {
    try {
      const data = localStorage.getItem(TEMP_UNSAVED_EVENTS_KEY);

      if (!data) {
        return { success: true, data: [] };
      }

      const events = JSON.parse(data) as CalendarEvent[];

      const parsedEvents = events.map((event) => ({
        ...event,
        startDate: new Date(event.startDate),
        endDate: new Date(event.endDate),
        created: new Date(event.created),
      }));

      return { success: true, data: parsedEvents };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load temporary events',
        data: [],
      };
    }
  },

  clearTempUnsavedEvents: (): StorageResult<void> => {
    try {
      localStorage.removeItem(TEMP_UNSAVED_EVENTS_KEY);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear temporary events',
      };
    }
  },
};
