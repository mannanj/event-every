import { beforeEach, describe, expect, test } from 'bun:test';
import { EventCandidateSchema } from '@event-every/scanner';
import { createReviewDraft, editReviewDraft } from '../scannerDraft';
import { reviewStorage } from '../reviewStorage';
import { eventStorage } from '../storage';

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

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.candidate.title.value).toBeNull();
    expect(result.data?.[0]?.candidate.description.value).toBe('Human edited description');
    expect(result.data?.[0]?.readiness.canGenerate).toBe(true);
  });

  test('rejects an entire record set when candidate, issues, or opaque source validation fails', () => {
    expect(reviewStorage.save([draft])).toEqual({ success: true });
    const [valid] = JSON.parse(localStorage.getItem('event-every:review-drafts:v1')!);
    const corruptions = [
      { ...valid, candidate: { ...valid.candidate, unexpected: true } },
      { ...valid, scanIssues: [{ code: 'not-a-scanner-issue' }] },
      { ...valid, source: { ...valid.source, rawBody: 'private source body' } },
    ];

    for (const corrupt of corruptions) {
      localStorage.setItem('event-every:review-drafts:v1', JSON.stringify([valid, corrupt]));
      const result = reviewStorage.load();
      expect(result.success).toBe(false);
      expect(result.data).toEqual([]);
      expect(result.error).toBe('Failed to load review drafts');
    }
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
    expect(result.success).toBe(true);
    expect(result.data?.map(({ id }) => id)).toEqual([second.id]);
  });

  test('returns generic StorageResult errors without serialized payloads', () => {
    const operations = [
      ['set', () => reviewStorage.save([draft]), 'Failed to save review drafts'],
      ['get', () => reviewStorage.load(), 'Failed to load review drafts'],
      ['remove', () => reviewStorage.clear(), 'Failed to clear review drafts'],
    ] as const;

    for (const [operation, call, expectedError] of operations) {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: new ThrowingStorage(operation),
      });
      const result = call();
      expect(result.success).toBe(false);
      expect(result.error).toBe(expectedError);
      expect(result.error).not.toContain('payload');
      expect(result.error).not.toContain(draft.candidate.description.value!);
    }
  });
});
