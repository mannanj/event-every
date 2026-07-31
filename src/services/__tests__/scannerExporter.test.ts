import { describe, expect, test } from 'bun:test';
import {
  EventCandidateSchema,
  generateIcs,
  type EventCandidate,
} from '@event-every/scanner';
import { createReviewDraft, editReviewDraft } from '../scannerDraft';
import { createBrowserDownloadEffects, createScannerExporter } from '../scannerExporter';
import type { ReviewDraft, ReviewSource } from '@/types/review';

const policyProdId = '-//Event Every//Scanner//EN';
const source: ReviewSource = {
  handle: { sourceId: 'source-1', kind: 'text', contentHandle: 'opaque-source-1' },
  label: null,
};
const floatingStart = {
  kind: 'floating' as const,
  date: { year: 2026, month: 8, day: 1 },
  time: { hour: 9, minute: 0, second: 0 },
};

function claim<Value>(value: Value) {
  return { value, confidence: 0.9, evidence: [] };
}

function candidate(overrides: Partial<EventCandidate> = {}): EventCandidate {
  return EventCandidateSchema.parse({
    candidateId: 'candidate-1',
    sourceUid: null,
    title: claim('Scanner event'),
    description: claim('A description'),
    location: claim('A location'),
    url: claim('https://example.test/event'),
    temporal: claim({ start: floatingStart, end: null, duration: null, allDay: false }),
    recurrence: claim(null),
    issues: [],
    ...overrides,
  });
}

function draft(overrides: Partial<EventCandidate> = {}, suffix = '1'): ReviewDraft {
  return createReviewDraft(candidate(overrides), [], source, {
    id: `draft-${suffix}`,
    exportUid: `export-${suffix}@example.test`,
    createdAt: '2026-07-29T12:00:00.000Z',
  });
}

function policyFor(value: ReviewDraft) {
  return { uid: value.exportUid, dtstamp: value.createdAt, prodId: policyProdId };
}

function successfulCalendar(value: ReviewDraft): string {
  const generated = generateIcs(value.candidate, policyFor(value));
  if (!generated.ok) throw new Error('Fixture must be Scanner-exportable');
  return generated.calendarText;
}

function outerEnvelope(calendarText: string): Readonly<{ header: string; event: string; footer: string }> {
  const start = calendarText.indexOf('BEGIN:VEVENT\r\n');
  const end = calendarText.indexOf('END:VEVENT\r\n');
  if (start < 0 || end < start || !calendarText.endsWith('END:VCALENDAR\r\n')) {
    throw new Error('Fixture must have one Scanner VCALENDAR envelope and VEVENT');
  }
  return {
    header: calendarText.slice(0, start),
    event: calendarText.slice(start, end + 'END:VEVENT\r\n'.length),
    footer: calendarText.slice(end + 'END:VEVENT\r\n'.length),
  };
}

function restoreProperty(target: object, key: PropertyKey, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}

function withBrowserDownloadMocks(
  input: Readonly<{
    appendChild?: () => void;
    click?: () => void;
  }>,
  run: (lifecycle: { removed: number; revoked: string[] }) => void,
): void {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  const lifecycle = { removed: 0, revoked: [] as string[] };
  const anchor = {
    href: '',
    download: '',
    click: () => input.click?.(),
    remove: () => { lifecycle.removed += 1; },
  };

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => anchor,
      body: { appendChild: () => input.appendChild?.() },
    },
  });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:scanner-test' });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: (objectUrl: string) => { lifecycle.revoked.push(objectUrl); },
  });

  try {
    run(lifecycle);
  } finally {
    restoreProperty(globalThis, 'document', documentDescriptor);
    restoreProperty(URL, 'createObjectURL', createObjectUrlDescriptor);
    restoreProperty(URL, 'revokeObjectURL', revokeObjectUrlDescriptor);
  }
}

describe('Scanner review draft export', () => {
  test('generates fresh Scanner bytes with the draft identity policy', () => {
    const downloads: Array<{ calendarText: string; filename: string; mimeType: string }> = [];
    const value = draft();
    const exporter = createScannerExporter({ download: (input) => downloads.push(input) });

    const result = exporter.exportReviewDraft(value);

    expect(result).toEqual({
      ok: true,
      warnings: value.readiness.warnings,
      omittedFields: value.readiness.omittedFields,
    });
    expect(downloads).toEqual([{
      calendarText: successfulCalendar(value),
      filename: 'Scanner event.ics',
      mimeType: 'text/calendar;charset=utf-8',
    }]);
  });

  test('exports an edit made immediately before export instead of cached bytes or readiness', () => {
    const downloads: Array<{ calendarText: string }> = [];
    const edited = editReviewDraft(draft(), { field: 'title', value: 'Edited immediately' });
    const exporter = createScannerExporter({ download: (input) => downloads.push(input) });

    const result = exporter.exportReviewDraft(edited);

    expect(result.ok).toBe(true);
    expect(downloads).toHaveLength(1);
    expect(downloads[0].calendarText).toBe(successfulCalendar(edited));
    expect(downloads[0].calendarText).toContain('SUMMARY:Edited immediately\r\n');
  });

  test('does not download a Scanner-blocked draft', () => {
    const downloads: unknown[] = [];
    const blocked = draft({ temporal: claim({ start: null, end: null, duration: null, allDay: false }) });
    const exporter = createScannerExporter({ download: (input) => downloads.push(input) });

    const result = exporter.exportReviewDraft(blocked);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.blockers.map(({ code }) => code)).toContain('missing_start');
    expect(downloads).toEqual([]);
  });

  test('exports Scanner warnings and omitted optional fields without changing Scanner CRLF bytes', () => {
    const downloads: Array<{ calendarText: string }> = [];
    const warningDraft = draft({
      title: claim(null), description: claim(null), location: claim(null), url: claim(null), recurrence: claim(null),
    });
    const exporter = createScannerExporter({ download: (input) => downloads.push(input) });

    const result = exporter.exportReviewDraft(warningDraft);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.omittedFields).toEqual(['title', 'description', 'location', 'url', 'recurrence', 'end']);
    expect(downloads[0].calendarText).toBe(successfulCalendar(warningDraft));
    expect(downloads[0].calendarText).not.toMatch(/(^|[^\r])\n/);
  });

  test('sanitizes a download filename without changing the Scanner calendar content', () => {
    const downloads: Array<{ calendarText: string; filename: string }> = [];
    const unsafeName = draft({ title: claim('A / unsafe: * filename?') });
    const exporter = createScannerExporter({ download: (input) => downloads.push(input) });

    exporter.exportReviewDraft(unsafeName);

    expect(downloads[0].filename).toBe('A - unsafe- - filename-.ics');
    expect(downloads[0].calendarText).toBe(successfulCalendar(unsafeName));
  });

  test('combines complete Scanner VEVENTs under one Scanner VCALENDAR envelope', () => {
    const downloads: Array<{ calendarText: string; filename: string }> = [];
    const first = draft({}, 'one');
    const second = draft({ title: claim('Second scanner event') }, 'two');
    const exporter = createScannerExporter({ download: (input) => downloads.push(input) });

    const result = exporter.exportReviewDrafts([first, second], 'Scanner / batch');
    const firstEnvelope = outerEnvelope(successfulCalendar(first));
    const secondEnvelope = outerEnvelope(successfulCalendar(second));

    expect(result.ok).toBe(true);
    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe('Scanner - batch.ics');
    expect(downloads[0].calendarText).toBe(`${firstEnvelope.header}${firstEnvelope.event}${secondEnvelope.event}${firstEnvelope.footer}`);
    expect(downloads[0].calendarText.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
    expect(downloads[0].calendarText.match(/END:VCALENDAR/g)).toHaveLength(1);
    expect(downloads[0].calendarText).not.toMatch(/(^|[^\r])\n/);
  });

  test('rejects a batch before downloading when any Scanner draft is blocked', () => {
    const downloads: unknown[] = [];
    const blocked = draft({ temporal: claim({ start: null, end: null, duration: null, allDay: false }) }, 'blocked');
    const exporter = createScannerExporter({ download: (input) => downloads.push(input) });

    const result = exporter.exportReviewDrafts([draft(), blocked], 'batch');

    expect(result.ok).toBe(false);
    expect(downloads).toEqual([]);
  });

  test('rejects malformed or incompatible generated batch envelopes before downloading', () => {
    const valid = successfulCalendar(draft());
    const malformedOutputs = [
      valid.replace('CALSCALE:GREGORIAN\r\n', 'CALSCALE:GREGORIAN\r\nX-ARBITRARY:must-not-pass\r\n'),
      valid.replace('VERSION:2.0\r\n', 'VERSION:2.0\r\nVERSION:2.0\r\n'),
      valid.replace('CALSCALE:GREGORIAN\r\n', 'CALSCALE:GREGORIAN\r\nBEGIN:VTIMEZONE\r\n'),
      valid.replace(policyProdId, '-//Other Generator//EN'),
    ];

    for (const calendarText of malformedOutputs) {
      const downloads: unknown[] = [];
      const exporter = createScannerExporter(
        { download: (input) => downloads.push(input) },
        { generateCalendar: () => ({ calendarText, warnings: [], omittedFields: [] }) },
      );

      const result = exporter.exportReviewDrafts([draft()], 'malformed');

      expect(result.ok).toBe(false);
      expect(downloads).toEqual([]);
    }
  });

  test('rejects nested or unclosed VCALENDAR component markers before downloading', () => {
    const valid = successfulCalendar(draft());
    const malformedOutputs = [
      valid.replace('SUMMARY:Scanner event\r\n', 'SUMMARY:Scanner event\r\nEND:VCALENDAR\r\n'),
      valid.replace('END:VCALENDAR\r\n', ''),
    ];

    for (const calendarText of malformedOutputs) {
      const downloads: unknown[] = [];
      const exporter = createScannerExporter(
        { download: (input) => downloads.push(input) },
        { generateCalendar: () => ({ calendarText, warnings: [], omittedFields: [] }) },
      );

      const result = exporter.exportReviewDrafts([draft()], 'malformed');

      expect(result.ok).toBe(false);
      expect(downloads).toEqual([]);
    }
  });

  test('rejects a bare-LF END:VCALENDAR injected within VEVENT before downloading', () => {
    const downloads: unknown[] = [];
    const calendarText = successfulCalendar(draft()).replace(
      'SUMMARY:Scanner event\r\n',
      'SUMMARY:Scanner event\r\nDESCRIPTION:Injected bare LF\nEND:VCALENDAR\r\n',
    );
    const exporter = createScannerExporter(
      { download: (input) => downloads.push(input) },
      { generateCalendar: () => ({ calendarText, warnings: [], omittedFields: [] }) },
    );

    const result = exporter.exportReviewDrafts([draft()], 'malformed');

    expect(result.ok).toBe(false);
    expect(downloads).toEqual([]);
  });

  test('rejects a lone CR in generated calendar text before downloading', () => {
    const downloads: unknown[] = [];
    const calendarText = successfulCalendar(draft()).replace('SUMMARY:Scanner event\r\n', 'SUMMARY:Scanner event\rEND:VCALENDAR\r\n');
    const exporter = createScannerExporter(
      { download: (input) => downloads.push(input) },
      { generateCalendar: () => ({ calendarText, warnings: [], omittedFields: [] }) },
    );

    const result = exporter.exportReviewDrafts([draft()], 'malformed');

    expect(result.ok).toBe(false);
    expect(downloads).toEqual([]);
  });

  test('revokes the object URL and removes an appended anchor when clicking throws', () => {
    const failure = new Error('click failed');

    withBrowserDownloadMocks({ click: () => { throw failure; } }, (lifecycle) => {
      expect(() => createBrowserDownloadEffects().download({
        calendarText: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n',
        filename: 'scanner.ics',
        mimeType: 'text/calendar;charset=utf-8',
      })).toThrow(failure);
      expect(lifecycle).toEqual({ removed: 1, revoked: ['blob:scanner-test'] });
    });
  });

  test('revokes the object URL and removes the anchor when appending throws', () => {
    const failure = new Error('append failed');

    withBrowserDownloadMocks({ appendChild: () => { throw failure; } }, (lifecycle) => {
      expect(() => createBrowserDownloadEffects().download({
        calendarText: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n',
        filename: 'scanner.ics',
        mimeType: 'text/calendar;charset=utf-8',
      })).toThrow(failure);
      expect(lifecycle).toEqual({ removed: 1, revoked: ['blob:scanner-test'] });
    });
  });
});
