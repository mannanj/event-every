import { beforeEach, describe, expect, test } from 'bun:test';
import { EventCandidateSchema } from '@event-every/scanner';
import { createReviewDraft, editReviewDraft } from '../scannerDraft';
import { reviewStorage } from '../reviewStorage';
import { eventStorage } from '../storage';
import Home from '@/app/page';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

class ThrowingStorage extends MemoryStorage {
  constructor(private readonly operation: 'get' | 'set' | 'remove') {
    super();
  }

  override getItem(key: string) {
    if (this.operation === 'get') throw new Error(`leaked get payload for ${key}`);
    return super.getItem(key);
  }

  override removeItem(key: string) {
    if (this.operation === 'remove') throw new Error(`leaked remove payload for ${key}`);
    super.removeItem(key);
  }

  override setItem(key: string, value: string) {
    if (this.operation === 'set') throw new Error(`leaked set payload for ${key}: ${value}`);
    super.setItem(key, value);
  }
}

const candidate = EventCandidateSchema.parse({
  candidateId: 'candidate-1',
  sourceUid: null,
  title: { value: null, confidence: null, evidence: [] },
  description: { value: 'Provider description', confidence: 0.75, evidence: [] },
  location: { value: null, confidence: null, evidence: [] },
  url: { value: null, confidence: null, evidence: [] },
  temporal: {
    value: {
      start: {
        kind: 'floating',
        date: { year: 2026, month: 8, day: 1 },
        time: { hour: 9, minute: 0, second: 0 },
      },
      end: null,
      duration: null,
      allDay: false,
    },
    confidence: null,
    evidence: [],
  },
  recurrence: { value: null, confidence: null, evidence: [] },
  issues: [],
});

const draft = createReviewDraft(candidate, [], {
  handle: { sourceId: 'source-1', kind: 'text', contentHandle: 'opaque-text-1' },
  label: null,
}, {
  id: 'a9cc9c79-c36c-4b1e-a13d-796cb6ceffb0',
  exportUid: 'export-1@example.test',
  createdAt: '2026-07-31T12:00:00.000Z',
});

describe('review draft storage', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  test('writes the versioned review DTO to the exact isolated key', () => {
    const unsafeDraft = {
      ...draft,
      readiness: { canGenerate: false, cached: 'must-not-persist' },
      request: { kind: 'text', text: 'private raw source' },
      dataUrl: 'data:image/png;base64,cHJpdmF0ZQ==',
      providerResponse: { body: 'private provider response' },
      credential: 'secret-value',
    } as unknown as typeof draft;

    expect(reviewStorage.save([unsafeDraft])).toEqual({ success: true });
    expect(localStorage.length).toBe(1);
    expect(localStorage.key(0)).toBe('event-every:review-drafts:v1');
    const [record] = JSON.parse(localStorage.getItem('event-every:review-drafts:v1')!);
    expect(Object.keys(record)).toEqual([
      'version', 'id', 'exportUid', 'createdAt', 'candidate', 'scanIssues', 'source',
    ]);
    expect(JSON.stringify(record)).not.toContain('private');
    expect(record).not.toHaveProperty('readiness');
    expect(record.source).toEqual({
      handle: { sourceId: 'source-1', kind: 'text', contentHandle: 'opaque-text-1' },
      label: null,
    });
  });

  test('round-trips null claims and edits while recomputing readiness', () => {
    const edited = editReviewDraft(draft, {
      field: 'description',
      value: 'Human edited description',
    });
    expect(reviewStorage.save([edited])).toEqual({ success: true });

    const result = reviewStorage.load();

    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') throw new Error('Expected persisted Scanner drafts');
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]?.candidate.title.value).toBeNull();
    expect(result.drafts[0]?.candidate.description.value).toBe('Human edited description');
    expect(result.drafts[0]?.readiness.canGenerate).toBe(true);
  });

  test('recovers malformed JSON, wrong schemas, and corrupt DTOs by removing only the Scanner key', () => {
    expect(reviewStorage.save([draft])).toEqual({ success: true });
    const [valid] = JSON.parse(localStorage.getItem('event-every:review-drafts:v1')!);
    const legacyCalendarState = JSON.stringify([{ id: 'legacy-event-1' }]);
    localStorage.setItem('event_every_history', legacyCalendarState);
    localStorage.setItem('event_every_temp_unsaved', JSON.stringify([{ id: 'legacy-unsaved-1' }]));

    const corruptions: unknown[] = [
      '{not-json',
      JSON.stringify({ version: 1 }),
      { ...valid, candidate: { ...valid.candidate, unexpected: true } },
      { ...valid, scanIssues: [{ code: 'not-a-scanner-issue' }] },
      { ...valid, source: { ...valid.source, rawBody: 'private source body' } },
    ];

    for (const corrupt of corruptions) {
      localStorage.setItem('event-every:review-drafts:v1', typeof corrupt === 'string' ? corrupt : JSON.stringify([valid, corrupt]));
      const result = reviewStorage.load();
      expect(result).toEqual({ status: 'recovered-corrupt', drafts: [] });
      expect(localStorage.getItem('event-every:review-drafts:v1')).toBeNull();
      expect(localStorage.getItem('event_every_history')).toBe(legacyCalendarState);
      expect(localStorage.getItem('event_every_temp_unsaved')).not.toBeNull();
    }
  });

  test('recovered corrupt storage completes hydration', () => {
    expect(Home.resolveReviewDraftHydration('recovered-corrupt')).toEqual({ hydrationComplete: true });
    expect(Home.resolveReviewDraftHydration('unavailable')).toEqual({ hydrationComplete: false });
  });

  test('corrupt Scanner key is removed', () => {
    const storage = new MemoryStorage();
    storage.setItem('event-every:review-drafts:v1', '{not-json');

    expect(reviewStorage.load(storage)).toEqual({ status: 'recovered-corrupt', drafts: [] });
    expect(storage.getItem('event-every:review-drafts:v1')).toBeNull();
  });

  test('unrelated storage remains untouched', () => {
    // Recent input drafts/history live in the summon-input IndexedDB database, never localStorage.
    let indexedDbOperations = 0;
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: { open: () => { indexedDbOperations += 1; } } as unknown as IDBFactory,
    });
    const storage = new MemoryStorage();
    const legacyEvent = JSON.stringify([{ id: 'legacy-event-1' }]);
    storage.setItem('event-every:review-drafts:v1', '{not-json');
    storage.setItem('event_every_history', legacyEvent);

    expect(reviewStorage.load(storage)).toEqual({ status: 'recovered-corrupt', drafts: [] });
    expect(storage.getItem('event_every_history')).toBe(legacyEvent);
    expect(indexedDbOperations).toBe(0);
  });

  test('returns unavailable when corrupt Scanner storage cannot be removed', () => {
    const storage = new ThrowingStorage('remove');
    storage.setItem('event-every:review-drafts:v1', '{not-json');

    expect(reviewStorage.load(storage)).toEqual({ status: 'unavailable' });
    expect(storage.getItem('event-every:review-drafts:v1')).toBe('{not-json');
  });

  test('clears only Scanner drafts and leaves legacy event state readable', () => {
    let indexedDbOperations = 0;
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: {
        deleteDatabase: () => { indexedDbOperations += 1; },
        open: () => { indexedDbOperations += 1; },
      } as unknown as IDBFactory,
    });
    const legacy = {
      id: 'legacy-1',
      title: 'Legacy event',
      startDate: '2026-08-01T12:00:00.000Z',
      endDate: '2026-08-01T13:00:00.000Z',
      created: '2026-07-31T12:00:00.000Z',
    };
    localStorage.setItem('event_every_history', JSON.stringify([legacy]));
    localStorage.setItem('event_every_temp_unsaved', JSON.stringify([legacy]));
    expect(reviewStorage.save([draft])).toEqual({ success: true });

    expect(reviewStorage.clear()).toEqual({ success: true });

    expect(localStorage.getItem('event-every:review-drafts:v1')).toBeNull();
    expect(localStorage.getItem('event_every_temp_unsaved')).not.toBeNull();
    expect(indexedDbOperations).toBe(0);
    const legacyResult = eventStorage.getAllEvents();
    expect(legacyResult.success).toBe(true);
    expect(legacyResult.data?.[0]?.title).toBe('Legacy event');
  });

  test('saving a remainder replaces only the Scanner draft collection', () => {
    const second = {
      ...draft,
      id: 'cc7c7c60-9463-4fb0-a079-db116de6a6bb',
      exportUid: 'export-2@example.test',
    };
    expect(reviewStorage.save([draft, second])).toEqual({ success: true });

    expect(reviewStorage.save([second])).toEqual({ success: true });

    const result = reviewStorage.load();
    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') throw new Error('Expected persisted Scanner drafts');
    expect(result.drafts.map(({ id }) => id)).toEqual([second.id]);
  });

  test('returns an unavailable load outcome without serialized payloads', () => {
    const operations = [
      ['set', () => reviewStorage.save([draft]), 'Failed to save review drafts'],
      ['get', () => reviewStorage.load(), undefined],
      ['remove', () => reviewStorage.clear(), 'Failed to clear review drafts'],
    ] as const;

    for (const [operation, call, expectedError] of operations) {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: new ThrowingStorage(operation),
      });
      const result = call();
      if (operation === 'get') {
        expect(result).toEqual({ status: 'unavailable' });
      } else {
        if (!('success' in result)) throw new Error('Expected a save or clear result');
        expect(result.success).toBe(false);
        expect(result.error).toBe(expectedError);
        expect(result.error).not.toContain('payload');
        expect(result.error).not.toContain(draft.candidate.description.value!);
      }
    }
  });

  test('maps throwing default localStorage property access to unavailable without escaping', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => { throw new Error('storage-access-denied'); },
    });

    expect(reviewStorage.load()).toEqual({ status: 'unavailable' });
  });

  test('keeps save and clear failure contracts when default localStorage property access throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => { throw new Error('storage-access-denied'); },
    });

    expect(reviewStorage.save([draft])).toEqual({ success: false, error: 'Failed to save review drafts' });
    expect(reviewStorage.clear()).toEqual({ success: false, error: 'Failed to clear review drafts' });
  });
});
