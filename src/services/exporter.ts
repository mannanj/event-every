import { createEvent, EventAttributes } from 'ics';
import { CalendarEvent } from '@/types/event';

export interface ExportResult {
  success: boolean;
  error?: string;
}

export function exportToICS(event: CalendarEvent): ExportResult {
  try {
    const eventAttributes: EventAttributes = {
      start: dateToArray(event.startDate),
      end: dateToArray(event.endDate),
      title: event.title,
      description: event.description,
      location: event.location,
      status: 'CONFIRMED',
      busyStatus: 'BUSY',
      productId: 'event-every/ics',
    };

    const { error, value } = createEvent(eventAttributes);

    if (error) {
      return { success: false, error: error.message || 'Failed to create event' };
    }

    if (!value) {
      return { success: false, error: 'No calendar data generated' };
    }

    downloadICS(value, event.title);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error occurred',
    };
  }
}

function dateToArray(date: Date): [number, number, number, number, number] {
  return [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
  ];
}

function downloadICS(content: string, eventTitle: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const filename = `${sanitizeFilename(eventTitle)}.ics`;
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 50) || 'event';
}
