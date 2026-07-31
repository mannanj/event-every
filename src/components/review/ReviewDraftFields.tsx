'use client';

import { useEffect, useState } from 'react';
import { RecurrenceClaimSchema, resolveZonedPoint, type TemporalPoint } from '@event-every/scanner';
import type { ReviewDraft, ReviewFieldEdit } from '@/types/review';

type Props = Readonly<{ draft: ReviewDraft; onEdit: (edit: ReviewFieldEdit) => void }>;
const fields = [['title', 'Title'], ['description', 'Description'], ['location', 'Location'], ['url', 'URL']] as const;
const empty = (value: string | null) => value ?? '';

function dateText(point: TemporalPoint | null) {
  if (!point || point.kind === 'partial') return '';
  const date = point.kind === 'date' ? point : point.date;
  return date.year === null ? '' : `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}
function timeText(point: TemporalPoint | null) {
  return !point || point.kind === 'date' || point.kind === 'partial' ? '' : `${String(point.time.hour).padStart(2, '0')}:${String(point.time.minute).padStart(2, '0')}`;
}
function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= 31 ? { year, month, day } : null;
}
function parseTime(value: string, second: number) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [hour, minute] = match.slice(1).map(Number);
  return hour <= 23 && minute <= 59 ? { hour, minute, second } : null;
}

function TextField({ draftId, field, label, value, onEdit }: Readonly<{ draftId: string; field: 'title' | 'description' | 'location' | 'url'; label: string; value: string | null; onEdit: (edit: ReviewFieldEdit) => void }>) {
  const [buffer, setBuffer] = useState(empty(value));
  useEffect(() => setBuffer(empty(value)), [value]);
  const missingId = `${draftId}-${field}-missing`;
  const commit = () => { const next = buffer.trim(); if (next !== empty(value)) onEdit({ field, value: next || null }); };
  return <label className="block text-sm font-medium">{label}{value === null && <span id={missingId} className="ml-2 text-gray-600 font-normal">Missing value</span>}<input aria-describedby={value === null ? missingId : undefined} className="mt-1 w-full border border-black px-2 py-1 font-normal" value={buffer} onChange={(event) => setBuffer(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}

export default function ReviewDraftFields({ draft, onEdit }: Props) {
  const temporal = draft.candidate.temporal.value;
  const start = temporal?.start ?? null; const end = temporal?.end ?? null;
  const [startDate, setStartDate] = useState(dateText(start)); const [startTime, setStartTime] = useState(timeText(start));
  const [endDate, setEndDate] = useState(dateText(end)); const [endTime, setEndTime] = useState(timeText(end));
  const [allDay, setAllDay] = useState<boolean | 'unknown'>(temporal?.allDay ?? 'unknown');
  const [timeZone, setTimeZone] = useState(start?.kind === 'zoned' ? start.timeZone : '');
  const [temporalDirty, setTemporalDirty] = useState(false);
  const [recurrence, setRecurrence] = useState(draft.candidate.recurrence.value ? JSON.stringify(draft.candidate.recurrence.value) : '');
  const [recurrenceDirty, setRecurrenceDirty] = useState(false); const [recurrenceError, setRecurrenceError] = useState<string | null>(null);

  useEffect(() => { setStartDate(dateText(start)); setStartTime(timeText(start)); setEndDate(dateText(end)); setEndTime(timeText(end)); setAllDay(temporal?.allDay ?? 'unknown'); setTimeZone(start?.kind === 'zoned' ? start.timeZone : ''); setTemporalDirty(false); setRecurrence(draft.candidate.recurrence.value ? JSON.stringify(draft.candidate.recurrence.value) : ''); setRecurrenceDirty(false); setRecurrenceError(null); }, [draft.id, draft.candidate.temporal.value, draft.candidate.recurrence.value, start, end, temporal?.allDay]);

  const temporalCommit = () => {
    if (!temporalDirty) return;
    const point = (original: TemporalPoint | null, dateBuffer: string, timeBuffer: string): TemporalPoint | null => {
      const date = parseDate(dateBuffer); if (!date) return null;
      if (allDay === 'unknown') return original;
      if (allDay === true) return { kind: 'date', ...date };
      const seconds = original && original.kind !== 'date' && original.kind !== 'partial' ? original.time.second : 0;
      const time = parseTime(timeBuffer, seconds); if (!time) return null;
      if (!timeZone.trim()) return { kind: 'floating', date, time };
      return resolveZonedPoint({
        kind: 'zoned', date, time, timeZone: timeZone.trim(), resolution: 'exact',
        possibleOffsets: [], sourceOffset: null, chosenOffset: null,
      }, []).point;
    };
    onEdit({ field: 'temporal', value: { start: point(start, startDate, startTime), end: point(end, endDate, endTime), duration: temporal?.duration ?? null, allDay } });
    setTemporalDirty(false);
  };
  const commitAllDay = (next: boolean | 'unknown') => {
    if (next === allDay) return;
    setAllDay(next);
    const toDate = (point: TemporalPoint | null): TemporalPoint | null => {
      if (!point || point.kind === 'partial') return point;
      const date = point.kind === 'date' ? point : point.date;
      return date.year === null ? point : { kind: 'date', year: date.year, month: date.month, day: date.day };
    };
    onEdit({ field: 'temporal', value: {
      start: next === true ? toDate(start) : start,
      end: next === true ? toDate(end) : end,
      duration: temporal?.duration ?? null,
      allDay: next,
    } });
    setTemporalDirty(false);
  };
  const recurrenceCommit = () => {
    if (!recurrenceDirty) return;
    const input = recurrence.trim();
    if (!input) { onEdit({ field: 'recurrence', value: null }); setRecurrenceDirty(false); setRecurrenceError(null); return; }
    try {
      const parsed = RecurrenceClaimSchema.safeParse(JSON.parse(input));
      if (!parsed.success) { setRecurrenceError('Recurrence must match the Scanner recurrence format.'); return; }
      onEdit({ field: 'recurrence', value: parsed.data }); setRecurrenceDirty(false); setRecurrenceError(null);
    } catch { setRecurrenceError('Recurrence must be valid JSON.'); }
  };
  const markDirty = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setTemporalDirty(true); };
  const temporalMissingId = `${draft.id}-temporal-missing`; const recurrenceMissingId = `${draft.id}-recurrence-missing`;
  return <div className="mt-4 space-y-3">
    {fields.map(([field, label]) => <TextField key={field} draftId={draft.id} field={field} label={label} value={draft.candidate[field].value} onEdit={onEdit} />)}
    <fieldset className="border border-black p-3"><legend className="px-1 font-semibold">When</legend>{temporal === null && <p id={temporalMissingId} className="text-sm text-gray-600">Missing temporal value</p>}{allDay === 'unknown' && <p id={`${draft.id}-all-day-unknown`} className="text-sm text-gray-600">Choose whether this is all day before editing date, time, or timezone.</p>}<p className="mb-2 text-sm text-gray-600">Clear the timezone for a floating-time warning. An unresolved DST fold remains blocked without offset evidence.</p><div className="grid gap-2 sm:grid-cols-2">
      <label className="text-sm font-medium">Start date<input disabled={allDay === 'unknown'} aria-label="Start date" aria-describedby={allDay === 'unknown' ? `${draft.id}-all-day-unknown` : temporal === null ? temporalMissingId : undefined} className="mt-1 w-full border border-black px-2 py-1 font-normal" value={startDate} onChange={(e) => markDirty(setStartDate)(e.target.value)} onBlur={temporalCommit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
      {allDay !== true && <label className="text-sm font-medium">Start time<input disabled={allDay === 'unknown'} aria-label="Start time" className="mt-1 w-full border border-black px-2 py-1 font-normal" value={startTime} onChange={(e) => markDirty(setStartTime)(e.target.value)} onBlur={temporalCommit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>}
      <label className="text-sm font-medium">End date<input disabled={allDay === 'unknown'} aria-label="End date" className="mt-1 w-full border border-black px-2 py-1 font-normal" value={endDate} onChange={(e) => markDirty(setEndDate)(e.target.value)} onBlur={temporalCommit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
      {allDay !== true && <label className="text-sm font-medium">End time<input disabled={allDay === 'unknown'} aria-label="End time" className="mt-1 w-full border border-black px-2 py-1 font-normal" value={endTime} onChange={(e) => markDirty(setEndTime)(e.target.value)} onBlur={temporalCommit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>}
      <label className="text-sm font-medium">Timezone<input disabled={allDay === 'unknown'} aria-label="Timezone" className="mt-1 w-full border border-black px-2 py-1 font-normal" value={timeZone} onChange={(e) => markDirty(setTimeZone)(e.target.value)} onBlur={temporalCommit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
      <label className="text-sm font-medium">All day<select aria-label="All day" className="mt-1 w-full border border-black px-2 py-1 font-normal" value={String(allDay)} onChange={(e) => commitAllDay(e.target.value === 'unknown' ? 'unknown' : e.target.value === 'true')}><option value="unknown">Unknown</option><option value="true">Yes</option><option value="false">No</option></select></label>
    </div></fieldset>
    <label className="block text-sm font-medium">Recurrence (optional structured JSON){draft.candidate.recurrence.value === null && <span id={recurrenceMissingId} className="ml-2 text-gray-600 font-normal">Missing value</span>}<textarea aria-label="Recurrence" aria-describedby={draft.candidate.recurrence.value === null ? recurrenceMissingId : undefined} className="mt-1 w-full border border-black px-2 py-1 font-mono text-xs font-normal" rows={3} value={recurrence} onChange={(e) => { setRecurrence(e.target.value); setRecurrenceDirty(true); setRecurrenceError(null); }} onBlur={recurrenceCommit} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.blur(); }} />{recurrenceError && <span role="alert" className="text-sm text-red-700">{recurrenceError}</span>}</label>
  </div>;
}
