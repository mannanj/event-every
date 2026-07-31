'use client';

import type { ReviewDraft, ReviewFieldEdit } from '@/types/review';
import ReviewDraftFields from './ReviewDraftFields';
import ReviewIssues from './ReviewIssues';

type ReviewDraftCardProps = Readonly<{
  draft: ReviewDraft;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  onEdit: (edit: ReviewFieldEdit) => void;
  onDelete: () => void;
}>;

export default function ReviewDraftCard({ draft, selected, onSelectedChange, onEdit, onDelete }: ReviewDraftCardProps) {
  const title = draft.candidate.title.value;
  const headingId = `review-draft-${draft.id}`;
  const readinessIssues = draft.readiness.canGenerate ? [] : draft.readiness.blockers;
  return (
    <article aria-labelledby={headingId} className="border-t-2 border-black bg-white p-4 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <label className="flex items-start gap-2 font-semibold">
          <input aria-label={`Select ${title ?? 'draft with missing title'} (${draft.id})`} type="checkbox" checked={selected} onChange={(event) => onSelectedChange(event.target.checked)} />
          <span id={headingId}>{title ?? <span aria-label="Title is missing" className="text-gray-600">Missing title</span>} <span className="text-xs font-normal">({draft.candidate.candidateId})</span></span>
        </label>
        <button type="button" aria-label={`Dismiss ${title ?? 'draft'} (${draft.id})`} onClick={onDelete} className="text-sm underline">Dismiss</button>
      </div>
      <ReviewDraftFields draft={draft} onEdit={onEdit} />
      <ReviewIssues label="Scan issues" ownerId={draft.candidate.candidateId} issues={draft.scanIssues} />
      <ReviewIssues label="Candidate issues" ownerId={draft.candidate.candidateId} issues={draft.candidate.issues} />
      {!draft.readiness.canGenerate && <ReviewIssues label="Export blockers" ownerId={draft.candidate.candidateId} issues={readinessIssues} />}
      <ReviewIssues label="Export warnings" ownerId={draft.candidate.candidateId} issues={draft.readiness.warnings} />
      <section aria-label="Omitted calendar fields" className="mt-3 text-sm">
        <h4 className="font-semibold">Omitted calendar fields</h4>
        <p>{draft.readiness.omittedFields.length ? draft.readiness.omittedFields.join(', ') : 'None'}</p>
      </section>
    </article>
  );
}
