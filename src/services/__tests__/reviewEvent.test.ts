import { describe, expect, test } from 'bun:test';
import { EventCandidateSchema, type EventCandidate } from '@event-every/scanner';
import type { ReviewDraft } from '@/types/review';
import { reviewDraftToCalendarEvent } from '../reviewEvent';

const claim = <Value>(value: Value) => ({ value, confidence: null, evidence: [] });

function candidate(overrides: Partial<Record<keyof EventCandidate, unknown>> = {}): EventCandidate {
  return EventCandidateSchema.parse({
    candidateId: '2c4c3508-20c8-470f-b073-318f78ff7ca9',
    sourceUid: null,
    title: claim('Civic Signal'),
    description: claim(null),
    location: claim(null),
    url: claim(null),
    temporal: claim({ start: null, end: null, duration: null, allDay: false }),
    recurrence: claim(null),
    issues: [],
    ...overrides,
  });
}

function draft(candidateOverrides: Partial<Record<keyof EventCandidate, unknown>> = {}): ReviewDraft {
  return {
    id: 'draft-1',
    exportUid: 'draft-1@event-every',
    createdAt: '2026-09-15T12:00:00.000Z',
    candidate: candidate(candidateOverrides),
    scanIssues: [],
    readiness: { canGenerate: false, blockers: [], warnings: [], omittedFields: [] },
    source: { handle: { sourceId: 's', kind: 'text', contentHandle: 'c' }, label: null },
  } as ReviewDraft;
}

const identity = { id: 'event-1', created: new Date('2026-09-15T12:00:00.000Z') };

describe('reviewDraftToCalendarEvent', () => {
  test('a zoned start becomes the right instant and keeps the source zone', () => {
    const event = reviewDraftToCalendarEvent(draft({
      temporal: claim({
        start: {
          kind: 'zoned',
          date: { year: 2026, month: 9, day: 22 },
          time: { hour: 19, minute: 0, second: 0 },
          timeZone: 'America/New_York',
          resolution: 'exact',
          possibleOffsets: ['-04:00'],
          sourceOffset: null,
          chosenOffset: '-04:00',
        },
        end: {
          kind: 'zoned',
          date: { year: 2026, month: 9, day: 22 },
          time: { hour: 20, minute: 30, second: 0 },
          timeZone: 'America/New_York',
          resolution: 'exact',
          possibleOffsets: ['-04:00'],
          sourceOffset: null,
          chosenOffset: '-04:00',
        },
        duration: null,
        allDay: false,
      }),
      url: claim('https://meet.google.com/odi-xddv-kez'),
    }), identity);

    // 19:00 in New York on 2026-09-22 is EDT, UTC-4.
    expect(event.startDate.toISOString()).toBe('2026-09-22T23:00:00.000Z');
    expect(event.endDate.toISOString()).toBe('2026-09-23T00:30:00.000Z');
    expect(event.timezone).toBe('America/New_York');
    expect(event.rawTimezone).toBe('America/New_York');
    expect(event.timezoneStatus).toBe('resolved');
    expect(event.allDay).toBe(false);
    expect(event.url).toBe('https://meet.google.com/odi-xddv-kez');
  });

  test('a start with no end gets an hour, which is what makes it exportable', () => {
    const event = reviewDraftToCalendarEvent(draft({
      temporal: claim({
        start: { kind: 'floating', date: { year: 2026, month: 3, day: 13 }, time: { hour: 9, minute: 30, second: 0 } },
        end: null,
        duration: null,
        allDay: false,
      }),
    }), identity);

    expect(event.endDate.getTime() - event.startDate.getTime()).toBe(60 * 60 * 1000);
    // No zone in the source, so the reader's is used and reported as a guess.
    expect(event.timezoneStatus).toBe('unknown');
    expect(event.rawTimezone).toBeUndefined();
  });

  test('a date with no time is all-day and lands on that calendar day in any zone', () => {
    const event = reviewDraftToCalendarEvent(draft({
      temporal: claim({
        start: { kind: 'date', year: 2026, month: 6, day: 12 },
        end: null,
        duration: null,
        allDay: 'unknown',
      }),
    }), identity);

    expect(event.allDay).toBe(true);
    expect(event.startDate.toISOString()).toBe('2026-06-12T00:00:00.000Z');
    expect(event.endDate.toISOString()).toBe('2026-06-13T00:00:00.000Z');
  });

  test('a partial point with a full date still places the event', () => {
    const event = reviewDraftToCalendarEvent(draft({
      temporal: claim({
        start: { kind: 'partial', year: 2026, month: 9, day: 22, hour: 19, minute: 0, second: null },
        end: null,
        duration: null,
        allDay: false,
      }),
    }), identity);

    expect(event.rawStartDate).toBe('2026-09-22T19:00:00');
    expect(event.allDay).toBe(false);
  });

  test('a partial point missing its year is not guessed into a wrong day', () => {
    const event = reviewDraftToCalendarEvent(draft({
      temporal: claim({
        start: { kind: 'partial', year: null, month: 9, day: 22, hour: 19, minute: 0, second: null },
        end: null,
        duration: null,
        allDay: false,
      }),
    }), identity);

    // The placeholder is the creation instant, never 0022 or 1970, and the
    // card is told the date is missing rather than shown a fabricated one.
    expect(event.startDate.toISOString()).toBe(identity.created.toISOString());
    expect(event.rawStartDate).toBeUndefined();
    expect(event.startMissing).toBe(true);
  });

  test('an untitled candidate still exports under a name', () => {
    expect(reviewDraftToCalendarEvent(draft({ title: claim(null) }), identity).title).toBe('Untitled Event');
  });

  test('an end before its start is corrected rather than exported backwards', () => {
    const event = reviewDraftToCalendarEvent(draft({
      temporal: claim({
        start: { kind: 'floating', date: { year: 2026, month: 3, day: 13 }, time: { hour: 14, minute: 0, second: 0 } },
        end: { kind: 'floating', date: { year: 2026, month: 3, day: 13 }, time: { hour: 9, minute: 0, second: 0 } },
        duration: null,
        allDay: false,
      }),
    }), identity);

    expect(event.endDate.getTime()).toBeGreaterThan(event.startDate.getTime());
  });
});

describe('reviewDraftToCalendarEvent: the flag does not outrank the point', () => {
  test('a date with no time is all-day even when the model says allDay: false', () => {
    const event = reviewDraftToCalendarEvent(draft({
      temporal: claim({
        start: { kind: 'date', year: 2026, month: 9, day: 22 },
        end: null,
        duration: null,
        allDay: false,
      }),
    }), identity);

    expect(event.allDay).toBe(true);
    expect(event.startDate.toISOString()).toBe('2026-09-22T00:00:00.000Z');
    expect(event.endDate.toISOString()).toBe('2026-09-23T00:00:00.000Z');
  });

  test('a timed start is not all-day even when the model says allDay: true', () => {
    const event = reviewDraftToCalendarEvent(draft({
      temporal: claim({
        start: { kind: 'zoned', date: { year: 2026, month: 10, day: 2 }, time: { hour: 20, minute: 0, second: 0 }, timeZone: 'America/Chicago', resolution: 'exact', possibleOffsets: ['-05:00'], sourceOffset: null, chosenOffset: '-05:00' },
        end: { kind: 'zoned', date: { year: 2026, month: 10, day: 2 }, time: { hour: 23, minute: 30, second: 0 }, timeZone: 'America/Chicago', resolution: 'exact', possibleOffsets: ['-05:00'], sourceOffset: null, chosenOffset: '-05:00' },
        duration: null,
        allDay: true,
      }),
    }), identity);

    expect(event.allDay).toBe(false);
    expect(event.startDate.toISOString()).toBe('2026-10-03T01:00:00.000Z');
    expect(event.endDate.toISOString()).toBe('2026-10-03T04:30:00.000Z');
  });

  test('an end equal to its start gets the default duration instead of zero length', () => {
    const event = reviewDraftToCalendarEvent(draft({
      temporal: claim({
        start: { kind: 'floating', date: { year: 2026, month: 3, day: 13 }, time: { hour: 14, minute: 0, second: 0 } },
        end: { kind: 'floating', date: { year: 2026, month: 3, day: 13 }, time: { hour: 14, minute: 0, second: 0 } },
        duration: null,
        allDay: false,
      }),
    }), identity);

    expect(event.endDate.getTime() - event.startDate.getTime()).toBe(60 * 60 * 1000);
  });

  test('an all-day event whose end is its own start date still spans the day', () => {
    const event = reviewDraftToCalendarEvent(draft({
      temporal: claim({
        start: { kind: 'date', year: 2026, month: 9, day: 22 },
        end: { kind: 'date', year: 2026, month: 9, day: 22 },
        duration: null,
        allDay: true,
      }),
    }), identity);

    expect(event.allDay).toBe(true);
    expect(event.endDate.toISOString()).toBe('2026-09-23T00:00:00.000Z');
  });
});

describe('long zone names from invites', () => {
  // The Togetherwork interview email: "10:30am (GMT-04:00) Eastern Time (US & Canada)".
  // Two cards in real history stored this as 06:30, the wall clock stamped as UTC.
  test('a Windows zone label places 10:30 Eastern at 14:30 UTC whatever the reader zone', () => {
    const event = reviewDraftToCalendarEvent(draft({
      temporal: claim({
        start: {
          kind: 'zoned',
          date: { year: 2026, month: 6, day: 15 },
          time: { hour: 10, minute: 30, second: 0 },
          timeZone: 'Eastern Time (US & Canada)',
          resolution: 'exact',
          possibleOffsets: ['-04:00'],
          sourceOffset: null,
          chosenOffset: '-04:00',
        },
        end: null,
        duration: null,
        allDay: false,
      }),
    }), identity);
    expect(event.startDate.toISOString()).toBe('2026-06-15T14:30:00.000Z');
    expect(event.timezone).toBe('America/New_York');
    expect(event.timezoneStatus).toBe('resolved');
  });
});

describe('missing start', () => {
  test('a candidate with no start is flagged instead of quietly dated to now', () => {
    const event = reviewDraftToCalendarEvent(draft({
      temporal: claim({ start: null, end: null, duration: null, allDay: false }),
    }), identity);
    expect(event.startMissing).toBe(true);
  });
  test('a stated start carries no flag', () => {
    const event = reviewDraftToCalendarEvent(draft({
      temporal: claim({
        start: { kind: 'floating', date: { year: 2026, month: 9, day: 22 }, time: { hour: 19, minute: 0, second: 0 } },
        end: null, duration: null, allDay: false,
      }),
    }), identity);
    expect(event.startMissing).toBeUndefined();
  });
});
