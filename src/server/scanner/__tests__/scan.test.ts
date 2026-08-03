import { describe, expect, mock, spyOn, test } from 'bun:test';
import {
  EventCandidateSchema,
  ProviderScanObservationSchema,
  type ProviderScanObservation,
  type TextLinkProviderPort,
  type VisionProviderPort,
} from '@event-every/scanner';
import { createScanJob } from '../job';
import { scanSource } from '../scan';

function claim<Value>(value: Value) {
  return { value, confidence: null, evidence: [] };
}

function observation(): ProviderScanObservation {
  return ProviderScanObservationSchema.parse({
    candidates: [
      {
        sourceUid: null,
        title: claim(null),
        description: claim(null),
        location: claim(null),
        url: claim(null),
        temporal: claim({ start: null, end: null, duration: null, allDay: 'unknown' }),
        recurrence: claim(null),
        issues: [
          { code: 'invalid_url', kind: 'invalid', severity: 'blocker', field: 'url', message: 'candidate URL', evidence: [] },
        ],
      },
      {
        sourceUid: null,
        title: claim('Second'),
        description: claim(null),
        location: claim(null),
        url: claim(null),
        temporal: claim({ start: null, end: null, duration: null, allDay: 'unknown' }),
        recurrence: claim(null),
        issues: [],
      },
    ],
    issues: [
      { code: 'field_incomplete', kind: 'incomplete', severity: 'blocker', field: 'temporal', message: 'time', evidence: [] },
      { code: 'field_not_found', kind: 'not_found', severity: 'warning', field: 'title', message: 'title', evidence: [] },
    ],
  });
}

describe('scanSource', () => {
  test('createScanJob threads the exact abort signal to provider fetch', async () => {
    const controller = new AbortController();
    const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 503 }));
    const handle = { sourceId: 'signal-source', kind: 'text' as const, contentHandle: 'opaque-signal' };
    const job = createScanJob(
      { kind: 'text', text: 'signal proof' },
      handle,
      { key: 'synthetic-scan-key', mode: 'community' },
      controller.signal,
    );

    try {
      await expect(job.provider.scan([handle])).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    } finally {
      fetch.mockRestore();
    }
  });

  test('scans a text source once through only the text port and preserves null claims', async () => {
    const text = { scan: mock(async () => observation()) } satisfies TextLinkProviderPort;
    const image = { scan: mock(async () => observation()) } satisfies VisionProviderPort;

    const result = await scanSource(
      { kind: 'text', handle: { sourceId: 'text-1', kind: 'text', contentHandle: 'opaque-text' }, provider: text },
      { candidateIdFactory: (() => 'candidate-1') },
    );

    expect(text.scan).toHaveBeenCalledTimes(1);
    expect(text.scan).toHaveBeenCalledWith([{ sourceId: 'text-1', kind: 'text', contentHandle: 'opaque-text' }]);
    expect(image.scan).toHaveBeenCalledTimes(0);
    expect(result.candidates[0]?.candidateId).toBe('candidate-1');
    expect(result.candidates[0]?.title.value).toBeNull();
    expect(result.issues.map(({ field }) => field)).toEqual(['title', 'temporal']);
    expect(result.candidates[0]?.issues.map(({ code }) => code)).toContain('invalid_url');
    expect(result.issues.map(({ code }) => code)).not.toContain('invalid_url');
    expect(result.candidates[1]?.issues.map(({ code }) => code)).not.toContain('invalid_url');

    const firstCandidate = result.candidates[0];
    expect(firstCandidate).toBeDefined();
    expect(Object.keys(firstCandidate ?? {}).sort()).toEqual([
      'candidateId',
      'description',
      'issues',
      'location',
      'recurrence',
      'sourceUid',
      'temporal',
      'title',
      'url',
    ]);
    expect(firstCandidate).toMatchObject({
      candidateId: 'candidate-1',
      sourceUid: null,
      title: { value: null },
      description: { value: null },
      location: { value: null },
      url: { value: null },
      temporal: { value: { start: null, end: null, duration: null, allDay: 'unknown' } },
      recurrence: { value: null },
    });
  });

  test('performs the load-bearing host candidate parse after converter validation', async () => {
    const text = { scan: mock(async () => observation()) } satisfies TextLinkProviderPort;
    const parse = spyOn(EventCandidateSchema, 'parse');

    try {
      await scanSource(
        { kind: 'text', handle: { sourceId: 'text-parse', kind: 'text', contentHandle: 'opaque-text' }, provider: text },
        { candidateIdFactory: (() => 'candidate-parse') },
      );

      // The converter parses both candidates; scanSource must parse both again at the host boundary.
      expect(parse).toHaveBeenCalledTimes(4);
    } finally {
      parse.mockRestore();
    }
  });

  test('scans an image source once through only the vision port and injects each candidate ID', async () => {
    const text = { scan: mock(async () => observation()) } satisfies TextLinkProviderPort;
    const image = { scan: mock(async () => observation()) } satisfies VisionProviderPort;
    const ids = ['image-candidate-1', 'image-candidate-2'];

    const result = await scanSource(
      { kind: 'image', handle: { sourceId: 'image-1', kind: 'image', contentHandle: 'opaque-image' }, provider: image },
      { candidateIdFactory: () => ids.shift() ?? 'unexpected' },
    );

    expect(image.scan).toHaveBeenCalledTimes(1);
    expect(image.scan).toHaveBeenCalledWith([{ sourceId: 'image-1', kind: 'image', contentHandle: 'opaque-image' }]);
    expect(text.scan).toHaveBeenCalledTimes(0);
    expect(result.candidates.map(({ candidateId }) => candidateId)).toEqual(['image-candidate-1', 'image-candidate-2']);
  });
});
