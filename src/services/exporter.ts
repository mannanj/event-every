import { createEvent, createEvents, EventAttributes } from 'ics';
import { CalendarEvent, EventAttachment } from '@/types/event';

export interface ExportResult {
  success: boolean;
  error?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

function addAttachmentsToICS(icsContent: string, attachments?: EventAttachment[]): string {
  if (!attachments || attachments.length === 0) {
    return icsContent;
  }

  const lines = icsContent.split('\n');
  const modifiedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    modifiedLines.push(lines[i]);

    if (lines[i].trim() === 'END:VEVENT') {
      attachments.forEach(attachment => {
        const dataUri = `data:${attachment.mimeType};base64,${attachment.data}`;
        modifiedLines.push(`ATTACH;FILENAME=${attachment.filename}:${dataUri}`);
      });
    }
  }

  return modifiedLines.join('\n');
}

export function exportToICS(event: CalendarEvent): ExportResult {
  try {
    const eventAttributes: EventAttributes = {
      start: dateToArray(event.startDate),
      end: dateToArray(event.endDate),
      title: event.title,
      description: event.description,
      location: event.location,
      url: event.url,
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

    const icsWithAttachments = addAttachmentsToICS(value, event.attachments);
    downloadICS(icsWithAttachments, event.title);
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

export function validateEvent(event: CalendarEvent): ValidationResult {
  const errors: string[] = [];

  if (!event.title || event.title.trim() === '') {
    errors.push('Event title is required');
  }

  if (!event.startDate || !(event.startDate instanceof Date) || isNaN(event.startDate.getTime())) {
    errors.push('Valid start date is required');
  }

  if (!event.endDate || !(event.endDate instanceof Date) || isNaN(event.endDate.getTime())) {
    errors.push('Valid end date is required');
  }

  if (event.startDate && event.endDate && event.startDate > event.endDate) {
    errors.push('Start date must be before end date');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateEvents(events: CalendarEvent[]): ValidationResult {
  const allErrors: string[] = [];

  events.forEach((event, index) => {
    const result = validateEvent(event);
    if (!result.isValid) {
      result.errors.forEach((error) => {
        allErrors.push(`Event ${index + 1} (${event.title || 'Untitled'}): ${error}`);
      });
    }
  });

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
  };
}

export function exportMultipleToICS(events: CalendarEvent[], filename?: string): ExportResult {
  try {
    if (events.length === 0) {
      return { success: false, error: 'No events to export' };
    }

    const validation = validateEvents(events);
    if (!validation.isValid) {
      return {
        success: false,
        error: `Validation failed:\n${validation.errors.join('\n')}`,
      };
    }

    const eventAttributesArray: EventAttributes[] = events.map((event) => ({
      start: dateToArray(event.startDate),
      end: dateToArray(event.endDate),
      title: event.title,
      description: event.description,
      location: event.location,
      url: event.url,
      status: 'CONFIRMED',
      busyStatus: 'BUSY',
      productId: 'event-every/ics',
    }));

    const { error, value } = createEvents(eventAttributesArray);

    if (error) {
      return { success: false, error: error.message || 'Failed to create events' };
    }

    if (!value) {
      return { success: false, error: 'No calendar data generated' };
    }

    let icsContent = value;
    events.forEach((event) => {
      if (event.attachments && event.attachments.length > 0) {
        icsContent = addAttachmentsToICS(icsContent, event.attachments);
      }
    });

    const exportFilename = filename || `batch-events-${events.length}`;
    downloadICS(icsContent, exportFilename);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error occurred',
    };
  }
}
