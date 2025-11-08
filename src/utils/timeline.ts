import { CalendarEvent } from '@/types/event';

export type TimelinePeriod = 'past' | 'today' | 'upcoming';

export interface TimelineSection {
  period: TimelinePeriod;
  label: string;
  events: CalendarEvent[];
}

export function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

export function isPast(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  return checkDate < today;
}

export function isFuture(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  return checkDate > today;
}

export function getEventPeriod(event: CalendarEvent): TimelinePeriod {
  if (isToday(event.startDate)) return 'today';
  if (isPast(event.startDate)) return 'past';
  return 'upcoming';
}

export function groupEventsByTimeline(events: CalendarEvent[]): TimelineSection[] {
  const sorted = [...events].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime()
  );

  const past = sorted.filter((e) => isPast(e.startDate));
  const today = sorted.filter((e) => isToday(e.startDate));
  const upcoming = sorted.filter((e) => isFuture(e.startDate));

  const sections: TimelineSection[] = [];

  if (past.length > 0) {
    sections.push({
      period: 'past',
      label: 'Past',
      events: past.reverse(),
    });
  }

  if (today.length > 0) {
    sections.push({
      period: 'today',
      label: 'Today',
      events: today,
    });
  }

  if (upcoming.length > 0) {
    sections.push({
      period: 'upcoming',
      label: 'Upcoming',
      events: upcoming,
    });
  }

  return sections;
}

export function formatEventDate(event: CalendarEvent): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };

  if (!event.allDay) {
    options.hour = 'numeric';
    options.minute = '2-digit';
  }

  return event.startDate.toLocaleString('en-US', options);
}
