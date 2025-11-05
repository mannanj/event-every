import { CalendarEvent } from '@/types/event';

/**
 * Normalizes a string for comparison by converting to lowercase,
 * removing special characters, and trimming whitespace.
 */
function normalizeString(str: string | undefined): string {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, ' ');
}

/**
 * Calculates similarity ratio between two strings using a simple approach.
 * Returns a value between 0 and 1, where 1 is identical.
 */
function stringSimilarity(str1: string, str2: string): number {
  const normalized1 = normalizeString(str1);
  const normalized2 = normalizeString(str2);

  if (normalized1 === normalized2) return 1;
  if (normalized1.length === 0 || normalized2.length === 0) return 0;

  // Check if one string contains the other
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return 0.9;
  }

  // Simple word overlap similarity
  const words1 = new Set(normalized1.split(' '));
  const words2 = new Set(normalized2.split(' '));
  const intersection = new Set([...words1].filter(word => words2.has(word)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Checks if two dates are within a specified time threshold (in minutes).
 */
function areDatesWithinThreshold(date1: Date, date2: Date, thresholdMinutes: number = 5): boolean {
  const diffMs = Math.abs(date1.getTime() - date2.getTime());
  const diffMinutes = diffMs / (1000 * 60);
  return diffMinutes <= thresholdMinutes;
}

/**
 * Determines if two events are likely duplicates based on:
 * - Title similarity
 * - Start date proximity
 * - Location similarity (if both have locations)
 */
function areEventsDuplicates(event1: CalendarEvent, event2: CalendarEvent): boolean {
  // Title must be highly similar (>=0.85)
  const titleSimilarity = stringSimilarity(event1.title, event2.title);
  if (titleSimilarity < 0.85) return false;

  // Start dates must be within 5 minutes
  if (!areDatesWithinThreshold(event1.startDate, event2.startDate, 5)) return false;

  // If both have locations, they should be similar
  if (event1.location && event2.location) {
    const locationSimilarity = stringSimilarity(event1.location, event2.location);
    if (locationSimilarity < 0.7) return false;
  }

  return true;
}

/**
 * Scores an event based on how much information it contains.
 * Higher score = more complete information.
 */
function scoreEventCompleteness(event: CalendarEvent): number {
  let score = 0;

  if (event.title && event.title !== 'Untitled Event') score += 2;
  if (event.description && event.description.length > 0) score += event.description.length / 100;
  if (event.location && event.location.length > 0) score += 1;
  if (event.attachments && event.attachments.length > 0) score += 0.5;

  return score;
}

/**
 * Merges two duplicate events, keeping the most complete information from both.
 */
function mergeEvents(event1: CalendarEvent, event2: CalendarEvent): CalendarEvent {
  const score1 = scoreEventCompleteness(event1);
  const score2 = scoreEventCompleteness(event2);

  // Use the event with higher completeness score as the base
  const base = score1 >= score2 ? event1 : event2;
  const other = score1 >= score2 ? event2 : event1;

  // Merge attachments from both events
  const mergedAttachments = [
    ...(base.attachments || []),
    ...(other.attachments || []).filter(
      otherAttachment => !(base.attachments || []).some(
        baseAttachment => baseAttachment.filename === otherAttachment.filename
      )
    )
  ];

  return {
    ...base,
    // Use longer description if available
    description: (base.description?.length || 0) > (other.description?.length || 0)
      ? base.description
      : other.description,
    // Use location if base doesn't have one
    location: base.location || other.location,
    // Merge attachments
    attachments: mergedAttachments.length > 0 ? mergedAttachments : undefined,
  };
}

/**
 * Removes duplicate events from an array of calendar events.
 * Returns a deduplicated array where similar events are merged into one.
 */
export function deduplicateEvents(events: CalendarEvent[]): CalendarEvent[] {
  if (events.length <= 1) return events;

  const deduplicated: CalendarEvent[] = [];
  const processed = new Set<number>();

  for (let i = 0; i < events.length; i++) {
    if (processed.has(i)) continue;

    let currentEvent = events[i];
    processed.add(i);

    // Check remaining events for duplicates
    for (let j = i + 1; j < events.length; j++) {
      if (processed.has(j)) continue;

      if (areEventsDuplicates(currentEvent, events[j])) {
        // Merge the duplicate into current event
        currentEvent = mergeEvents(currentEvent, events[j]);
        processed.add(j);
      }
    }

    deduplicated.push(currentEvent);
  }

  return deduplicated;
}
