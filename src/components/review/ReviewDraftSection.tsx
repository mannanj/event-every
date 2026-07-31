'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReviewDraft, ReviewFieldEdit } from '@/types/review';
import ReviewDraftCard from './ReviewDraftCard';

type ReviewDraftSectionProps = Readonly<{
  drafts: readonly ReviewDraft[];
  onEdit: (id: string, edit: ReviewFieldEdit) => void;
  onDelete: (id: string) => void;
  onExport: (drafts: readonly ReviewDraft[]) => void;
}>;

export default function ReviewDraftSection({ drafts, onEdit, onDelete, onExport }: ReviewDraftSectionProps) {
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(() => drafts.map((draft) => draft.id));
  const seenIds = useRef(new Set(drafts.map((draft) => draft.id)));
  useEffect(() => {
    setSelectedIds((previous) => {
      const present = new Set(drafts.map((draft) => draft.id));
      const retained = previous.filter((id) => present.has(id));
      const additions = drafts.map((draft) => draft.id).filter((id) => !seenIds.current.has(id));
      additions.forEach((id) => seenIds.current.add(id));
      return [...retained, ...additions];
    });
  }, [drafts]);
  if (drafts.length === 0) return null;
  const selectedDrafts = drafts.filter((draft) => selectedIds.includes(draft.id));
  const blocked = selectedDrafts.some((draft) => !draft.readiness.canGenerate);
  return (
    <section aria-label="Scanner review drafts" className="mb-12">
      <div className="border-2 border-black bg-white">
        <div className="flex items-center justify-between gap-3 p-4">
          <h2 className="text-lg font-bold">Review scanned events</h2>
          <button type="button" onClick={() => onExport(selectedDrafts)} disabled={selectedDrafts.length === 0 || blocked} className="border-2 border-black bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:border-gray-400 disabled:bg-gray-400" aria-label="Export selected review drafts">Export</button>
        </div>
        {drafts.map((draft) => <ReviewDraftCard key={draft.id} draft={draft} selected={selectedIds.includes(draft.id)} onSelectedChange={(selected) => setSelectedIds((previous) => selected ? [...previous, draft.id] : previous.filter((id) => id !== draft.id))} onEdit={(edit) => onEdit(draft.id, edit)} onDelete={() => onDelete(draft.id)} />)}
      </div>
    </section>
  );
}
