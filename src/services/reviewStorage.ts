import { EventCandidateSchema, ScannerIssueSchema } from '@event-every/scanner';
import { z } from 'zod';
import type { ReviewDraft } from '@/types/review';
import { E1SourceHandleSchema } from '@/types/scannerHttp';
import { createReviewDraft } from './scannerDraft';
import type { StorageResult } from './storage';

const REVIEW_DRAFTS_KEY = 'event-every:review-drafts:v1';

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

function save(drafts: readonly ReviewDraft[]): StorageResult<void> {
  try {
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
    localStorage.setItem(REVIEW_DRAFTS_KEY, JSON.stringify(records));
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to save review drafts' };
  }
}

function load(): StorageResult<ReviewDraft[]> {
  try {
    const serialized = localStorage.getItem(REVIEW_DRAFTS_KEY);
    if (serialized === null) return { success: true, data: [] };

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
    return { success: true, data: drafts };
  } catch {
    return { success: false, error: 'Failed to load review drafts', data: [] };
  }
}

function clear(): StorageResult<void> {
  try {
    localStorage.removeItem(REVIEW_DRAFTS_KEY);
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to clear review drafts' };
  }
}

export const reviewStorage = { save, load, clear };
