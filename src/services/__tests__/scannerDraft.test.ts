import { describe, expect, test } from 'bun:test';
import {
  EventCandidateSchema,
  type EventCandidate,
  type ScannerIssue,
} from '@event-every/scanner';
import {
  createReviewDraft,
  editReviewDraft,
} from '../scannerDraft';
import type { ReviewFieldEdit, ReviewSource } from '../../types/review';

const identity = {
  id: 'draft-1',
  exportUid: 'export-1@example.test',
  createdAt: '2026-07-29T12:00:00Z',
} as const;

const source: ReviewSource = {
  handle: { sourceId: 'source-1', kind: 'text', contentHandle: 'opaque-text-1' },
  label: null,
};

const floatingStart = {
  kind: 'floating' as const,
  date: { year: 2026, month: 8, day: 1 },
  time: { hour: 9, minute: 0, second: 0 },
};

function claim<Value>(value: Value) {
  return { value, confidence: 0.75, evidence: [{
    sourceId: 'source-1',
    locator: 'body',
    excerpt: 'Scanner evidence',
    startOffset: 0,
    endOffset: 16,
  }] };
}

const issueTraits = {
  invalid_url: { kind: 'invalid', severity: 'blocker' },
  invalid_recurrence: { kind: 'invalid', severity: 'blocker' },
  field_incomplete: { kind: 'incomplete', severity: 'blocker' },
} as const;

function issue(field: ScannerIssue['field'], code: keyof typeof issueTraits): ScannerIssue {
  const trait = issueTraits[code];
  return {
    code,
    kind: trait.kind,
    severity: trait.severity,
    field,
    message: `${code} for ${field}`,
    evidence: [],
  };
}

function candidate(overrides: Partial<EventCandidate> = {}): EventCandidate {
  return EventCandidateSchema.parse({
    candidateId: 'candidate-1',
    sourceUid: null,
    title: claim(null),
    description: claim('A description'),
    location: claim('A location'),
    url: claim(null),
    temporal: claim({ start: floatingStart, end: null, duration: null, allDay: false }),
    recurrence: claim(null),
    issues: [],
    ...overrides,
  });
}

function draftFor(value: EventCandidate) {
  return createReviewDraft(value, [], source, identity);
}

describe('scanner review drafts', () => {
  test('preserves a null provider title without an invented fallback', () => {
    const draft = draftFor(candidate());

    expect(draft.candidate.title.value).toBeNull();
    expect(draft.candidate.title).toEqual(claim(null));
  });

  test('keeps a missing start as a readiness blocker', () => {
    const draft = draftFor(candidate({
      temporal: claim({ start: null, end: null, duration: null, allDay: false }),
    }));

    expect(draft.candidate.temporal.value?.start).toBeNull();
    expect(draft.readiness.canGenerate).toBe(false);
    if (!draft.readiness.canGenerate) {
      expect(draft.readiness.blockers.map(({ code }) => code)).toContain('missing_start');
    }
  });

  test('uses only caller-injected draft identity and export policy values', () => {
    const draft = draftFor(candidate());

    expect(draft.id).toBe(identity.id);
    expect(draft.exportUid).toBe(identity.exportUid);
    expect(draft.createdAt).toBe(identity.createdAt);
  });

  test('parses construction candidates and every edit through the Scanner schema', () => {
    const malformedCandidate = {
      ...candidate(),
      candidateId: '',
    } as EventCandidate;
    const malformedEdit = {
      field: 'title',
      value: 123,
    } as unknown as ReviewFieldEdit;

    expect(() => draftFor(malformedCandidate)).toThrow();
    expect(() => editReviewDraft(draftFor(candidate()), malformedEdit)).toThrow();
  });

  test('edits one string claim without changing the other claims', () => {
    const before = draftFor(candidate());
    const beforeCandidate = structuredClone(before.candidate);
    const edited = editReviewDraft(before, { field: 'title', value: 'Human title' });

    expect(before.candidate).toEqual(beforeCandidate);
    expect(edited.candidate.title).toEqual({
      value: 'Human title', confidence: null, evidence: [],
    });
    expect({ ...edited.candidate, title: before.candidate.title }).toEqual(before.candidate);
    expect(edited.scanIssues).toBe(before.scanIssues);
    expect(edited.source).toBe(before.source);
  });

  test('edits temporal and recurrence claims without retaining evidence', () => {
    const before = draftFor(candidate());
    const beforeCandidate = structuredClone(before.candidate);
    const temporal = { start: floatingStart, end: null, duration: 'PT1H', allDay: false } as const;
    const temporalEdited = editReviewDraft(before, { field: 'temporal', value: temporal });
    const temporalCandidate = structuredClone(temporalEdited.candidate);
    const recurrence = {
      rule: {
        frequency: 'WEEKLY' as const,
        interval: null,
        count: null,
        until: null,
        byMonth: [],
        byMonthDay: [],
        byDay: [],
        weekStart: null,
      },
      rDates: [],
      exDates: [],
    };
    const recurrenceEdited = editReviewDraft(temporalEdited, { field: 'recurrence', value: recurrence });

    expect(before.candidate).toEqual(beforeCandidate);
    expect(temporalEdited.candidate).toEqual(temporalCandidate);
    expect(temporalEdited.candidate.temporal).toEqual({ value: temporal, confidence: null, evidence: [] });
    expect(recurrenceEdited.candidate.recurrence).toEqual({ value: recurrence, confidence: null, evidence: [] });
  });

  test('removes only stale issues for a repaired field', () => {
    const before = draftFor(candidate({
      url: claim('not a URL'),
      recurrence: claim({
        rule: {
          frequency: 'WEEKLY', interval: null, count: null, until: null,
          byMonth: [], byMonthDay: [], byDay: [], weekStart: null,
        },
        rDates: [], exDates: [],
      }),
      issues: [
        issue('url', 'invalid_url'),
        issue('temporal', 'field_incomplete'),
        issue('recurrence', 'invalid_recurrence'),
      ],
    }));
    const urlEdited = editReviewDraft(before, { field: 'url', value: 'https://example.test/event' });
    const temporalEdited = editReviewDraft(urlEdited, {
      field: 'temporal',
      value: { start: floatingStart, end: null, duration: null, allDay: false },
    });
    const recurrenceEdited = editReviewDraft(temporalEdited, { field: 'recurrence', value: null });

    expect(urlEdited.candidate.issues.map(({ field }) => field)).toEqual(['temporal', 'recurrence']);
    expect(temporalEdited.candidate.issues.map(({ field }) => field)).toEqual(['recurrence']);
    expect(recurrenceEdited.candidate.issues).toEqual([]);
    expect(recurrenceEdited.readiness.canGenerate).toBe(true);
  });

  test('recomputes readiness immediately after URL, temporal, and recurrence repairs', () => {
    const invalidUrl = draftFor(candidate({ url: claim('not a URL') }));
    const repairedUrl = editReviewDraft(invalidUrl, {
      field: 'url',
      value: 'https://example.test/event',
    });
    expect(invalidUrl.readiness.canGenerate).toBe(false);
    expect(repairedUrl.readiness.canGenerate).toBe(true);

    const missingStart = draftFor(candidate({
      temporal: claim({ start: null, end: null, duration: null, allDay: false }),
    }));
    const repairedTemporal = editReviewDraft(missingStart, {
      field: 'temporal',
      value: { start: floatingStart, end: null, duration: null, allDay: false },
    });
    expect(missingStart.readiness.canGenerate).toBe(false);
    expect(repairedTemporal.readiness.canGenerate).toBe(true);

    const invalidRecurrence = draftFor(candidate({
      issues: [issue('recurrence', 'invalid_recurrence')],
    }));
    const repairedRecurrence = editReviewDraft(invalidRecurrence, {
      field: 'recurrence',
      value: null,
    });
    expect(invalidRecurrence.readiness.canGenerate).toBe(false);
    expect(repairedRecurrence.readiness.canGenerate).toBe(true);
  });

  test('keeps an evidence-free zoned DST fold blocked but permits a floating edit with a warning', () => {
    const before = draftFor(candidate());
    const fold = {
      kind: 'zoned' as const,
      date: { year: 2026, month: 11, day: 1 },
      time: { hour: 1, minute: 30, second: 0 },
      timeZone: 'America/New_York',
      resolution: 'fold' as const,
      possibleOffsets: [],
      sourceOffset: null,
      chosenOffset: null,
    };
    const zoned = editReviewDraft(before, {
      field: 'temporal', value: { start: fold, end: null, duration: null, allDay: false },
    });
    const floating = editReviewDraft(zoned, {
      field: 'temporal', value: { start: floatingStart, end: null, duration: null, allDay: false },
    });

    expect(zoned.candidate.temporal.evidence).toEqual([]);
    expect(zoned.readiness.canGenerate).toBe(false);
    if (!zoned.readiness.canGenerate) {
      expect(zoned.readiness.blockers.map(({ code }) => code)).toContain('dst_fold');
    }
    expect(floating.candidate.temporal.value?.start?.kind).toBe('floating');
    expect(floating.readiness.warnings.map(({ code }) => code)).toContain('floating_time');
  });

  test('clears a string field to null and recomputes readiness on every edit', () => {
    const before = draftFor(candidate({ title: claim('Original title') }));
    const changed = editReviewDraft(before, { field: 'title', value: null });

    expect(changed.candidate.title).toEqual({ value: null, confidence: null, evidence: [] });
    expect(changed.readiness).not.toBe(before.readiness);
    expect(changed.readiness.warnings.map(({ code }) => code)).toContain('field_not_found');
  });
});
