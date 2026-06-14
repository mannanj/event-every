import { CalendarEvent } from '@/types/event';
import { normalizeUrl } from '@/utils/url';
import { convertRawToDate } from '@/utils/timeConversion';
import { resolveTimezoneZone } from '@/utils/timezone';

interface ICSEvent {
  uid?: string;
  summary?: string;
  dtstart?: string;
  dtend?: string;
  dtstartTzid?: string;
  dtendTzid?: string;
  location?: string;
  description?: string;
  url?: string;
  allDay: boolean;
}

export async function parseICSFile(file: File): Promise<CalendarEvent[]> {
  try {
    const text = await file.text();
    return parseICSContent(text);
  } catch (error) {
    console.error('Error reading ICS file:', error);
    throw new Error('Failed to read calendar file');
  }
}

export function parseICSContent(icsText: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const lines = icsText.split(/\r\n|\n|\r/);

  let currentEvent: ICSEvent | null = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Handle line continuations (lines starting with space or tab)
    while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
      i++;
      line += lines[i].substring(1);
    }

    line = line.trim();

    if (line === 'BEGIN:VEVENT') {
      currentEvent = { allDay: false };
    } else if (line === 'END:VEVENT' && currentEvent) {
      const calendarEvent = convertICSEventToCalendarEvent(currentEvent);
      if (calendarEvent) {
        events.push(calendarEvent);
      }
      currentEvent = null;
    } else if (currentEvent) {
      const colonIndex = line.indexOf(':');
      const semicolonIndex = line.indexOf(';');

      let fieldName: string;
      let fieldValue: string;
      const params: Record<string, string> = {};

      if (semicolonIndex !== -1 && (colonIndex === -1 || semicolonIndex < colonIndex)) {
        // Field has parameters (e.g., DTSTART;VALUE=DATE:20240101)
        fieldName = line.substring(0, semicolonIndex);
        const paramString = line.substring(semicolonIndex + 1, colonIndex);
        fieldValue = line.substring(colonIndex + 1);

        // Parse parameters
        const paramPairs = paramString.split(';');
        paramPairs.forEach(pair => {
          const [key, value] = pair.split('=');
          if (key && value) {
            params[key.toUpperCase()] = value;
          }
        });
      } else if (colonIndex !== -1) {
        // Simple field (e.g., SUMMARY:Meeting)
        fieldName = line.substring(0, colonIndex);
        fieldValue = line.substring(colonIndex + 1);
      } else {
        continue;
      }

      fieldName = fieldName.toUpperCase();

      switch (fieldName) {
        case 'UID':
          currentEvent.uid = fieldValue;
          break;
        case 'SUMMARY':
          currentEvent.summary = unescapeICSText(fieldValue);
          break;
        case 'DTSTART':
          currentEvent.dtstart = fieldValue;
          currentEvent.dtstartTzid = params['TZID'];
          if (params['VALUE'] === 'DATE') {
            currentEvent.allDay = true;
          }
          break;
        case 'DTEND':
          currentEvent.dtend = fieldValue;
          currentEvent.dtendTzid = params['TZID'];
          break;
        case 'LOCATION':
          currentEvent.location = unescapeICSText(fieldValue);
          break;
        case 'DESCRIPTION':
          currentEvent.description = unescapeICSText(fieldValue);
          break;
        case 'URL':
          currentEvent.url = fieldValue;
          break;
      }
    }
  }

  return events;
}

function convertICSEventToCalendarEvent(icsEvent: ICSEvent): CalendarEvent | null {
  if (!icsEvent.dtstart || !icsEvent.summary) {
    return null;
  }

  const startDate = parseICSDate(icsEvent.dtstart, icsEvent.dtstartTzid);
  const endDate = icsEvent.dtend
    ? parseICSDate(icsEvent.dtend, icsEvent.dtendTzid)
    : new Date(startDate.getTime() + 60 * 60 * 1000);

  if (!startDate) {
    return null;
  }

  return {
    id: crypto.randomUUID(),
    title: icsEvent.summary || 'Untitled Event',
    startDate,
    endDate,
    location: icsEvent.location,
    description: icsEvent.description,
    url: normalizeUrl(icsEvent.url),
    allDay: icsEvent.allDay,
    created: new Date(),
    source: 'text',
    originalInput: `Imported from ICS file`,
  };
}

function parseICSDate(dateString: string, tzid?: string): Date {
  // Format: YYYYMMDD or YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ. Any ;PARAMETERS (incl. TZID) were
  // already split off upstream in parseICSContent; the TZID is passed back in separately.
  if (dateString.length === 8) {
    // Date only (YYYYMMDD) — all-day. (The local-midnight zone-dependence is addressed by task-194.)
    const year = parseInt(dateString.substring(0, 4));
    const month = parseInt(dateString.substring(4, 6)) - 1;
    const day = parseInt(dateString.substring(6, 8));
    return new Date(year, month, day);
  } else if (dateString.length >= 15) {
    // DateTime (YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ)
    const year = parseInt(dateString.substring(0, 4));
    const month = parseInt(dateString.substring(4, 6)) - 1;
    const day = parseInt(dateString.substring(6, 8));
    const hour = parseInt(dateString.substring(9, 11));
    const minute = parseInt(dateString.substring(11, 13));
    const second = parseInt(dateString.substring(13, 15));

    if (dateString.endsWith('Z')) {
      // Explicit UTC.
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    }

    if (tzid) {
      // Honor the declared source zone: normalize the TZID (IANA name / abbreviation / numeric
      // offset) to a valid IANA zone, then reuse convertRawToDate — the same chokepoint the rest
      // of the app uses — so a zoned time imports to the correct instant regardless of the
      // importer's zone. An unresolvable TZID degrades to the browser zone (resolveTimezoneZone).
      const zone = resolveTimezoneZone(tzid).timezone;
      const ymd = `${dateString.substring(0, 4)}-${dateString.substring(4, 6)}-${dateString.substring(6, 8)}`;
      const hms = `${dateString.substring(9, 11)}:${dateString.substring(11, 13)}:${dateString.substring(13, 15)}`;
      return convertRawToDate(`${ymd}T${hms}`, zone);
    }

    // No TZID and no Z: a floating wall time → interpret in the importer's local zone.
    return new Date(year, month, day, hour, minute, second);
  }

  // Fallback to current date if parsing fails
  return new Date();
}

function unescapeICSText(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}
