import {
  EventCandidateSchema,
  validateForIcs,
  type EventCandidate,
  type ScannerIssue,
} from '@event-every/scanner';
import type {
  ReviewDraft,
  ReviewFieldEdit,
  ReviewSource,
} from '../types/review';

const prodId = '-//Event Every//Scanner//EN';

type DraftIdentity = Readonly<{
  id: string;
  exportUid: string;
  createdAt: string;
}>;

function readinessFor(candidate: EventCandidate, identity: Pick<ReviewDraft, 'exportUid' | 'createdAt'>) {
  return validateForIcs(candidate, {
    uid: identity.exportUid,
    dtstamp: identity.createdAt,
    prodId,
  });
}

export function createReviewDraft(
  candidate: EventCandidate,
  scanIssues: readonly ScannerIssue[],
  source: ReviewSource,
  identity: DraftIdentity,
): ReviewDraft {
  const parsedCandidate = EventCandidateSchema.parse(candidate);
  return {
    ...identity,
    candidate: parsedCandidate,
    scanIssues,
    readiness: readinessFor(parsedCandidate, identity),
    source,
  };
}

export function editReviewDraft(
  draft: ReviewDraft,
  edit: ReviewFieldEdit,
): ReviewDraft {
  const candidate = EventCandidateSchema.parse({
    ...draft.candidate,
    [edit.field]: {
      value: edit.value,
      confidence: null,
      evidence: [],
    },
    issues: draft.candidate.issues.filter((issue) => issue.field !== edit.field),
  });

  return {
    ...draft,
    candidate,
    readiness: readinessFor(candidate, draft),
  };
}
