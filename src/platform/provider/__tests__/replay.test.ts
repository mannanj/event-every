import { describe, expect, test } from 'bun:test';
import { ScannerIssueSchema } from '@event-every/scanner';
import { DurableScanReplaySchema, DurableSummaryReplaySchema, DurableTimezoneReplaySchema, materializeScanReplay, toDurableScanReplay, toDurableSummaryReplay, toDurableTimezoneReplay } from '../replay';

const sourceId = '123e4567-e89b-42d3-a456-426614174000';
const contentHandle = '123e4567-e89b-42d3-a456-426614174002';
const candidateId = '123e4567-e89b-42d3-a456-426614174001';
const claim = (value: unknown) => ({ value, confidence: 0.8, evidence: [{ sourceId, locator: 'provider://secret', excerpt: 'secret source', startOffset: 0, endOffset: 1 }] });
const temporal = { start: null, end: null, duration: null, allDay: 'unknown' };
const recurrence = { rule: { frequency: 'DAILY', interval: null, count: null, until: null, byMonth: [], byMonthDay: [], byDay: [], weekStart: null }, rDates: [], exDates: [] };
const source = { sourceId, kind: 'text' as const, contentHandle };
const candidate = (overrides: Record<string, unknown> = {}) => ({ candidateId, sourceUid: 'provider-source', title: claim('Town Hall'), description: claim('Notes'), location: claim('Hall'), url: claim('https://example.test'), temporal: claim(temporal), recurrence: claim(recurrence), issues: [], ...overrides });
const replay = (candidates = [candidate()], issues: unknown[] = []) => ({ source, candidates, issues });

describe('durable minimized replay', () => {
  test('retains only strict local source/candidate ids and byte-replays serialized projection including top-level issues', () => {
    const durable = toDurableScanReplay(replay([candidate({ issues: [{ code: 'field_incomplete', field: 'title', message: 'provider authored', evidence: [{ locator: 'secret' }] }] })], [{ code: 'invalid_url', field: 'scan', message: 'provider authored' }]));
    expect(durable.source).toEqual(source);
    expect(durable.candidates[0]?.sourceUid).toBeNull();
    expect(durable.candidates[0]?.title.evidence).toEqual([]);
    expect(JSON.stringify(durable)).not.toContain('provider authored');
    const serialized = JSON.stringify(durable);
    const restored = DurableScanReplaySchema.parse(JSON.parse(serialized));
    expect(JSON.stringify(materializeScanReplay(durable))).toBe(JSON.stringify(materializeScanReplay(restored)));
    expect(materializeScanReplay(restored).issues[0]).toMatchObject({ message: 'The URL is invalid.', evidence: [] });
  });

  test('rejects source fallback, links, non-UUID local ids, and raw temporal/recurrence markers', () => {
    expect(() => toDurableScanReplay({ sourceId, candidates: [candidate()], issues: [] })).toThrow('provider_invalid_response');
    expect(() => toDurableScanReplay({ ...replay(), source: { ...source, kind: 'link' } })).toThrow('provider_invalid_response');
    expect(() => toDurableScanReplay({ ...replay(), source: { ...source, contentHandle: 'not-a-uuid' } })).toThrow('provider_invalid_response');
    expect(() => toDurableScanReplay(replay([candidate({ temporal: claim({ raw: 'provider marker' }) })]))).toThrow('provider_invalid_response');
    expect(() => toDurableScanReplay(replay([candidate({ recurrence: claim({ raw: 'provider marker' }) })]))).toThrow('provider_invalid_response');
  });

  test('enforces candidate and aggregate issue boundaries', () => {
    const candidates = Array.from({ length: 50 }, (_, index) => candidate({ candidateId: `123e4567-e89b-42d3-a456-${String(index).padStart(12, '0')}` }));
    expect(() => toDurableScanReplay(replay(candidates))).not.toThrow();
    expect(() => toDurableScanReplay(replay([...candidates, candidate({ candidateId: '123e4567-e89b-42d3-a456-999999999999' })]))).toThrow('provider_invalid_response');
    const issues = Array.from({ length: 200 }, () => ({ code: 'field_incomplete', field: 'title' }));
    expect(() => toDurableScanReplay(replay([candidate({ issues: issues.slice(0, 100) })], issues.slice(100)))).not.toThrow();
    expect(() => toDurableScanReplay(replay([candidate({ issues })], [{ code: 'field_incomplete', field: 'title' }]))).toThrow('provider_invalid_response');
  });

  test('enforces every UTF-8 field boundary and serialized candidate limit', () => {
    for (const [field, bytes] of [['title', 512], ['description', 16 * 1024], ['location', 2 * 1024], ['url', 2_048]] as const) {
      const exact = 'a'.repeat(bytes); const over = 'a'.repeat(bytes + 1);
      expect(() => toDurableScanReplay(replay([candidate({ [field]: claim(exact) })]))).not.toThrow();
      expect(() => toDurableScanReplay(replay([candidate({ [field]: claim(over) })]))).toThrow('provider_invalid_response');
    }
    const point = { kind: 'zoned', date: { year: 2026, month: 1, day: 1 }, time: { hour: 0, minute: 0, second: 0 }, timeZone: 'UTC', resolution: 'exact', possibleOffsets: ['x'], sourceOffset: null, chosenOffset: null };
    const rich = { ...recurrence, rDates: [point] };
    const empty = toDurableScanReplay(replay([candidate({ recurrence: claim(rich) })])).candidates[0]!;
    const accepted = { ...empty, recurrence: { ...empty.recurrence, value: { ...rich, rDates: [{ ...point, possibleOffsets: ['a'.repeat(64 * 1024 - new TextEncoder().encode(JSON.stringify(empty)).byteLength + 1)] }] } } };
    const rejected = { ...accepted, recurrence: { ...accepted.recurrence, value: { ...accepted.recurrence.value!, rDates: [{ ...accepted.recurrence.value!.rDates[0]!, possibleOffsets: [`${accepted.recurrence.value!.rDates[0]!.possibleOffsets[0]}a`] }] } } };
    expect(new TextEncoder().encode(JSON.stringify(accepted)).byteLength).toBe(64 * 1024);
    expect(() => DurableScanReplaySchema.parse({ source, candidates: [accepted], issues: [] })).not.toThrow();
    expect(() => DurableScanReplaySchema.parse({ source, candidates: [rejected], issues: [] })).toThrow();
  });

  test('enforces exact summary and timezone boundaries', () => {
    for (const value of ['Team Lunch', 'Team Lunch Today']) expect(toDurableSummaryReplay(value)).toEqual({ summary: value });
    for (const value of ['Team', 'Team Lunch Today Now', 'Team, Lunch', 'Team\nLunch', 'TEAM Lunch']) expect(() => toDurableSummaryReplay(value)).toThrow('provider_invalid_response');
    const exact96 = `Á${'a'.repeat(92)} B`; expect(toDurableSummaryReplay(exact96)).toEqual({ summary: exact96 });
    expect(() => toDurableSummaryReplay(`Á${'a'.repeat(93)} B`)).toThrow('provider_invalid_response');
    for (const timezone of ['UTC', 'Etc/UTC', 'America/New_York', 'US/Eastern']) expect(toDurableTimezoneReplay({ timezone, confidence: 0 })).toEqual({ timezone, confidence: 0 });
    for (const confidence of [NaN, Infinity, -Infinity]) expect(() => toDurableTimezoneReplay({ timezone: 'UTC', confidence })).toThrow('provider_invalid_response');
    expect(() => toDurableTimezoneReplay({ timezone: 'Unknown/Zone', confidence: 0.5 })).toThrow('provider_invalid_response');
    expect(DurableTimezoneReplaySchema.safeParse({ timezone: 'a'.repeat(255), confidence: 0.5 }).success).toBeTrue();
    expect(DurableTimezoneReplaySchema.safeParse({ timezone: 'a'.repeat(256), confidence: 0.5 }).success).toBeFalse();
  });

  test('accepts non-control Unicode whitespace in summaries and rejects separator controls', () => {
    for (const summary of ['Team\u00a0Lunch', 'Team\u2003Lunch Today']) expect(toDurableSummaryReplay(summary)).toEqual({ summary });
    for (const summary of ['Team\tLunch', 'Team\nLunch', 'Team\rLunch', 'Team\u2028Lunch', 'Team, Lunch']) expect(() => toDurableSummaryReplay(summary)).toThrow('provider_invalid_response');
  });

  test('round-trips summary and timezone durable bytes exactly', () => {
    const summary = toDurableSummaryReplay('Team\u00a0Lunch');
    const timezone = toDurableTimezoneReplay({ timezone: 'America/New_York', confidence: 0.5 });
    expect(JSON.stringify(summary)).toBe(JSON.stringify(DurableSummaryReplaySchema.parse(JSON.parse(JSON.stringify(summary)))));
    expect(JSON.stringify(timezone)).toBe(JSON.stringify(DurableTimezoneReplaySchema.parse(JSON.parse(JSON.stringify(timezone)))));
  });

  test('materializes every local issue trait as an exact Scanner issue', () => {
    const codes = ['field_not_found', 'field_incomplete', 'field_ambiguous', 'field_conflicting', 'invalid_url', 'invalid_date', 'invalid_time', 'invalid_time_zone', 'invalid_duration', 'missing_start', 'missing_year', 'unknown_all_day', 'floating_time', 'dst_gap', 'dst_fold', 'offset_mismatch', 'end_before_start', 'end_duration_conflict', 'incompatible_temporal_kinds', 'invalid_recurrence', 'unsupported_recurrence', 'missing_export_uid', 'invalid_dtstamp', 'invalid_prodid', 'malformed_ics'] as const;
    const materialized = materializeScanReplay(toDurableScanReplay(replay([], codes.map((code) => ({ code, field: 'scan' })))));
    expect(materialized.issues).toHaveLength(codes.length);
    for (const issue of materialized.issues) expect(ScannerIssueSchema.safeParse(issue).success).toBeTrue();
  });
});
