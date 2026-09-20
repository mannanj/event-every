import { afterEach, describe, expect, test } from 'bun:test';
import { EventCandidateSchema, type EventCandidate } from '@event-every/scanner';
import { setTypeSafeKeyForTests } from '../client';
import { evidenceText } from '../../scanner/evidence';
import { MAX_EXCERPT_CHARS, candidateSourceText, planFor, startOf, verifyCandidates } from '../verify';

const evidence = (excerpt: string | null) => [{ sourceId: 'source-1', locator: null, excerpt, startOffset: null, endOffset: null }];

function claim<Value>(value: Value, excerpt: string | null = null) {
  return { value, confidence: 0.8, evidence: excerpt === null ? [] : evidence(excerpt) };
}

const floatingStart = { kind: 'floating' as const, date: { year: 2026, month: 10, day: 3 }, time: { hour: 19, minute: 30, second: 0 } };

function candidate(overrides: Partial<EventCandidate> = {}): EventCandidate {
  return EventCandidateSchema.parse({
    candidateId: 'candidate-1',
    sourceUid: null,
    title: claim('Autumn Social', 'AUTUMN SOCIAL'),
    description: claim(null),
    location: claim('The Old Hall', 'at The Old Hall'),
    url: claim(null),
    temporal: claim({ start: floatingStart, end: null, duration: null, allDay: false }, 'Fri 3 Oct, 7.30pm'),
    recurrence: claim(null),
    issues: [],
    ...overrides,
  });
}

describe('evidence as the source text', () => {
  const quoted = 'AUTUMN SOCIAL\nat The Old Hall\nFri 3 Oct, 7.30pm';

  test('concatenates the excerpts the model quoted, in claim order, without repeats', () => {
    expect(evidenceText(candidate(), MAX_EXCERPT_CHARS)).toBe(quoted);
  });

  test('keeps nothing at all when the cap is zero, which is the default', () => {
    expect(evidenceText(candidate(), 0)).toBe('');
  });

  test('is empty when the model quoted nothing, so that candidate is skipped', () => {
    const quiet = candidate({ title: claim('Autumn Social'), location: claim(null), temporal: claim({ start: floatingStart, end: null, duration: null, allDay: false }) });
    expect(evidenceText(quiet, MAX_EXCERPT_CHARS)).toBe('');
    expect(planFor(quiet, '', '2026-09-19')).toBeNull();
  });

  test('a text scan uses the request text, an image scan falls back to the excerpts', () => {
    const evidence = new Map([['candidate-1', quoted]]);
    expect(candidateSourceText('candidate-1', 'Autumn Social, Friday 3 October at 7.30pm', evidence)).toBe('Autumn Social, Friday 3 October at 7.30pm');
    expect(candidateSourceText('candidate-1', null, evidence)).toBe(quoted);
    expect(candidateSourceText('candidate-unknown', null, evidence)).toBe('');
  });
});

describe('startOf', () => {
  test('reads each point kind, and fills a year the source omitted', () => {
    expect(startOf(floatingStart, 2026)).toEqual({ startDate: '2026-10-03', startTime: '19:30' });
    expect(startOf({ kind: 'date', year: null, month: 10, day: 3 }, 2026)).toEqual({ startDate: '2026-10-03', startTime: null });
    expect(startOf({ kind: 'partial', year: null, month: 10, day: 3, hour: 9, minute: null, second: null }, 2026))
      .toEqual({ startDate: '2026-10-03', startTime: '09:00' });
  });

  test('is null when there is no day to stand on', () => {
    expect(startOf(null, 2026)).toBeNull();
    expect(startOf({ kind: 'partial', year: 2026, month: null, day: null, hour: 9, minute: 0, second: null }, 2026)).toBeNull();
  });
});

describe('planFor', () => {
  const text = 'AUTUMN SOCIAL\nat The Old Hall\nFri 3 Oct, 7.30pm';

  test('checks the fields the scanner claimed, and asks a duration for a start with no end', () => {
    expect(Object.keys(planFor(candidate(), text, '2026-09-19')!.questions).sort())
      .toEqual(['date_ok', 'duration', 'location_ok', 'time_ok']);
  });

  test('asks no duration when the source stated an end of its own', () => {
    const ended = candidate({ temporal: claim({ start: floatingStart, end: { ...floatingStart, time: { hour: 22, minute: 0, second: 0 } }, duration: null, allDay: false }, 'Fri 3 Oct, 7.30pm-10pm') });
    expect(Object.keys(planFor(ended, text, '2026-09-19')!.questions)).not.toContain('duration');
  });

  test('asks the all-day question only when the scanner was unsure', () => {
    const unsure = candidate({ temporal: claim({ start: floatingStart, end: null, duration: null, allDay: 'unknown' }, 'Fri 3 Oct') });
    expect(Object.keys(planFor(unsure, text, '2026-09-19')!.questions)).toContain('timed');
    expect(Object.keys(planFor(candidate(), text, '2026-09-19')!.questions)).not.toContain('timed');
  });

  test('offers title candidates only for a title that is missing or carries a date', () => {
    expect(planFor(candidate(), text, '2026-09-19')!.titleOptions).toEqual([]);
    const dated = candidate({ title: claim('Autumn Social Friday 3 October', 'AUTUMN SOCIAL') });
    const plan = planFor(dated, text, '2026-09-19')!;
    expect(plan.titleOptions.length).toBeGreaterThan(1);
    expect(plan.questions.title).toBeDefined();
  });

  test('sends the calendar lookup when the text has no four-digit year', () => {
    expect(planFor(candidate(), text, '2026-09-19')!.state.calendar).toBeDefined();
    expect(planFor(candidate(), 'Autumn Social on 3 October 2026 at 7.30pm', '2026-09-19')!.state.calendar).toBeUndefined();
  });

  test('with no date claimed, judges the place alone rather than nothing', () => {
    const undated = candidate({ temporal: claim({ start: null, end: null, duration: null, allDay: 'unknown' }, 'at The Old Hall') });
    expect(Object.keys(planFor(undated, text, '2026-09-19')!.questions)).toEqual(['location_ok']);
  });
});

describe('verifyCandidates', () => {
  afterEach(() => setTypeSafeKeyForTests(undefined));

  test('returns nothing at all without a key, so the response is the scanner untouched', async () => {
    setTypeSafeKeyForTests(null);
    expect(await verifyCandidates([candidate()], { requestText: null, evidence: new Map(), nowMs: Date.parse('2026-09-19T10:00:00Z') })).toEqual([]);
  });

  test('returns nothing for no candidates', async () => {
    setTypeSafeKeyForTests('test-key');
    expect(await verifyCandidates([], { requestText: null, evidence: new Map(), nowMs: Date.parse('2026-09-19T10:00:00Z') })).toEqual([]);
  });
});
