import { EventCandidateSchema, ScannerIssueSchema } from '@event-every/scanner';
import { z } from 'zod';
import type { ReviewDraft } from '@/types/review';
import { E1SourceHandleSchema } from '@/types/scannerHttp';
import { createReviewDraft } from './scannerDraft';
import type { StorageResult } from './storage';

const REVIEW_STORAGE_KEY = 'event-every:review-drafts:v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type ReviewDraftLoadResult =
  | Readonly<{ status: 'loaded'; drafts: ReviewDraft[] }>
  | Readonly<{ status: 'empty'; drafts: [] }>
  | Readonly<{ status: 'recovered-corrupt'; drafts: [] }>
  | Readonly<{ status: 'unavailable' }>;

const StoredReviewDraftSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().uuid(),
  exportUid: z.string().min(1),
  createdAt: z.string().datetime(),
  candidate: EventCandidateSchema,
  scanIssues: z.array(ScannerIssueSchema),
  source: z.strictObject({
    handle: E1SourceHandleSchema,
    label: z.string().max(120).nullable(),
  }),
});

function save(drafts: readonly ReviewDraft[], storage?: StorageLike): StorageResult<void> {
  try {
    storage ??= localStorage;
    const records = drafts.map((draft) => StoredReviewDraftSchema.parse({
      version: 1,
      id: draft.id,
      exportUid: draft.exportUid,
      createdAt: draft.createdAt,
      candidate: draft.candidate,
      scanIssues: draft.scanIssues,
      source: {
        handle: draft.source.handle,
        label: draft.source.label,
      },
    }));
    storage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(records));
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to save review drafts' };
  }
}

function load(storage?: StorageLike): ReviewDraftLoadResult {
  let serialized: string | null;
  try {
    storage ??= localStorage;
    serialized = storage.getItem(REVIEW_STORAGE_KEY);
  } catch {
    return { status: 'unavailable' };
  }

  if (serialized === null) return { status: 'empty', drafts: [] };

  try {
    const records = z.array(StoredReviewDraftSchema).parse(JSON.parse(serialized));
    const drafts = records.map((record) => createReviewDraft(
      record.candidate,
      record.scanIssues,
      record.source,
      {
        id: record.id,
        exportUid: record.exportUid,
        createdAt: record.createdAt,
      },
    ));
    return { status: 'loaded', drafts };
  } catch {
    try {
      storage ??= localStorage;
      storage.removeItem(REVIEW_STORAGE_KEY);
      return { status: 'recovered-corrupt', drafts: [] };
    } catch {
      return { status: 'unavailable' };
    }
  }
}

function clear(storage?: StorageLike): StorageResult<void> {
  try {
    storage ??= localStorage;
    const remove = storage.removeItem.bind(storage);
    remove(REVIEW_STORAGE_KEY);
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to clear review drafts' };
  }
}

export const reviewStorage = { save, load, clear };
