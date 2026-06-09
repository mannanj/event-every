'use client';

import { useEffect, useMemo, useState } from 'react';
import { InputHistoryEntry } from '@/types/input';

interface InputHistoryModalProps {
  open: boolean;
  entries: InputHistoryEntry[];
  onClose: () => void;
  onApply: (entry: InputHistoryEntry) => void;
  pendingSummaryIds?: Set<string>;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, new Date(now.getTime() - 86400000))) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(d);
}

function timeLabel(ts: number): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
}

// Fuzzy match: each whitespace-separated query term must appear as an ordered
// (gappy) subsequence of the haystack. Case-insensitive; no dependency.
function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] === needle[i]) i++;
  }
  return i === needle.length;
}

function matchesQuery(query: string, entry: InputHistoryEntry): boolean {
  const hay = `${entry.text} ${entry.summary ?? ''} ${entry.files
    .map((f) => f.name)
    .join(' ')}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => isSubsequence(term, hay));
}

export default function InputHistoryModal({
  open,
  entries,
  onClose,
  onApply,
  pendingSummaryIds,
}: InputHistoryModalProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Reset the search when the modal closes so reopening starts fresh.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // Lock background page scroll while open so wheel/touch scroll stays scoped to
  // the modal and never chains to the page below.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Object URLs for image thumbnails — created only while open, revoked on close/change.
  // Keyed off the full entry list (stable per open) rather than the filtered list, so
  // typing in the search box doesn't thrash URL creation/revocation.
  const thumbUrls = useMemo(() => {
    const map = new Map<string, string>();
    if (open) {
      for (const entry of entries) {
        for (const f of entry.files) {
          if (f.kind === 'image') {
            try {
              map.set(f.id, URL.createObjectURL(f.file));
            } catch {
              // Unreadable stored blob — skip; the card shows no thumbnail rather than erroring.
            }
          }
        }
      }
    }
    return map;
  }, [open, entries]);

  useEffect(() => {
    return () => {
      thumbUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [thumbUrls]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return entries;
    return entries.filter((e) => matchesQuery(q, e));
  }, [entries, query]);

  const groups = useMemo(() => {
    const byDay = new Map<string, InputHistoryEntry[]>();
    for (const entry of filtered) {
      const key = new Date(entry.createdAt).toDateString();
      const list = byDay.get(key);
      if (list) list.push(entry);
      else byDay.set(key, [entry]);
    }
    return Array.from(byDay.values());
  }, [filtered]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black bg-opacity-60 flex items-start justify-center p-4 overflow-y-auto overscroll-contain"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="input-history-modal"
    >
      <div className="bg-white border-2 border-black w-full max-w-5xl my-8">
        <div className="sticky top-0 bg-white border-b-2 border-black z-10">
          <div className="flex items-center justify-between px-6 py-4">
            <h2 className="text-xl font-bold">Recent summons</h2>
            <button
              onClick={onClose}
              className="p-1 text-black hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-black"
              aria-label="Close recent summons"
              data-testid="input-history-close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {entries.length > 0 && (
            <div className="px-6 pb-4">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search summons…"
                aria-label="Search recent summons"
                data-testid="input-history-search"
                className="w-full border-2 border-black px-3 py-2 text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          )}
        </div>

        <div className="p-6">
          {entries.length === 0 ? (
            <div className="py-16 text-center text-gray-500" data-testid="input-history-empty">
              Nothing summoned yet — your inputs will show up here.
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-500" data-testid="input-history-no-results">
              No summons match “{query.trim()}”.
            </div>
          ) : (
            groups.map((dayEntries) => (
              <div key={new Date(dayEntries[0].createdAt).toDateString()} className="mb-8">
                <h3
                  className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-3"
                  data-testid="input-history-day"
                >
                  {dayLabel(dayEntries[0].createdAt)}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {dayEntries.map((entry) => {
                    const images = entry.files.filter((f) => f.kind === 'image');
                    const calendars = entry.files.filter((f) => f.kind === 'calendar');
                    const hasSummary = !!entry.summary;
                    const isPending = !hasSummary && (pendingSummaryIds?.has(entry.id) ?? false);
                    return (
                      <button
                        key={entry.id}
                        onClick={() => onApply(entry)}
                        className="relative text-left border-2 border-black bg-white p-3 h-44 flex flex-col gap-2 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-black overflow-hidden"
                        data-testid="input-history-card"
                        title="Load this input"
                      >
                        {(hasSummary || isPending) && (
                          <>
                            {/* Reserve a top row so the absolutely-positioned label never overlaps the thumbnails. */}
                            <div className="h-5 shrink-0" aria-hidden="true" />
                            {hasSummary ? (
                              <span
                                className="absolute top-2 left-3 right-3 text-xs font-bold uppercase tracking-wide text-black truncate"
                                data-testid="input-history-summary"
                              >
                                {entry.summary}
                              </span>
                            ) : (
                              <span
                                className="absolute top-2 left-3 h-3 w-20 bg-gray-200 animate-pulse"
                                data-testid="input-history-summary-pending"
                                aria-label="Summarizing…"
                              />
                            )}
                          </>
                        )}
                        {(images.length > 0 || calendars.length > 0) && (
                          <div className="flex gap-1.5 flex-wrap">
                            {images.slice(0, 3).map((f) => (
                              <img
                                key={f.id}
                                src={thumbUrls.get(f.id)}
                                alt={f.name}
                                className="w-10 h-10 object-cover border border-black"
                              />
                            ))}
                            {calendars.map((f) => (
                              <span
                                key={f.id}
                                className="inline-flex items-center gap-1 px-1.5 h-10 border border-black bg-gray-100 text-xs"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                {f.eventCount ?? ''}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="flex-1 text-sm text-black whitespace-pre-wrap overflow-hidden line-clamp-4">
                          {entry.text || (images.length > 0 ? `${images.length} image${images.length === 1 ? '' : 's'}` : 'Calendar file')}
                        </p>
                        <span className="text-xs text-gray-500">{timeLabel(entry.createdAt)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
