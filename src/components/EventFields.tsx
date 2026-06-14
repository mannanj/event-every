'use client';

import { useState, useEffect, useRef } from 'react';
import { CalendarEvent } from '@/types/event';
import { convertRawToDate, formatDateForInput, formatTimeForInput, resyncRawFields, clampEndNotBeforeStart } from '@/utils/timeConversion';
import { getBrowserTimezone } from '@/utils/timezone';
import { normalizeUrl } from '@/utils/url';
import { validateEvent, EventFormValues } from '@/utils/validation';
import EditableField from './EditableField';
import TimezonePicker, { friendlyTimezoneLabel } from './TimezonePicker';
import AttachmentList from './AttachmentList';
import URLPill from './URLPill';

interface EventFieldsProps {
  event: CalendarEvent;
  onChange: (updatedEvent: CalendarEvent) => void;
  showAttachments?: boolean;
  hideTitle?: boolean;
  tzSuggestion?: { timezone: string; confidence: number };
  onTzSuggestionApply?: (timezone: string) => void;
  onTzSuggestionDismiss?: () => void;
  onTimezoneUserChange?: () => void;
  hideTimezoneInfo?: boolean;
  mode?: 'inline' | 'block';
}

interface FormData {
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  description: string;
  url: string;
  allDay: boolean;
}

function seedFormData(event: CalendarEvent): FormData {
  return {
    title: event.title || '',
    startDate: formatDateForInput(event.startDate),
    startTime: formatTimeForInput(event.startDate),
    endDate: formatDateForInput(event.endDate),
    endTime: formatTimeForInput(event.endDate),
    location: event.location || '',
    description: event.description || '',
    url: event.url || '',
    allDay: event.allDay,
  };
}

export default function EventFields({
  event,
  onChange,
  showAttachments = true,
  hideTitle = false,
  tzSuggestion,
  onTzSuggestionApply,
  onTzSuggestionDismiss,
  onTimezoneUserChange,
  hideTimezoneInfo = false,
  mode = 'inline',
}: EventFieldsProps) {
  const [formData, setFormData] = useState<FormData>(() => seedFormData(event));
  const [editingField, setEditingField] = useState<string | null>(null);
  const [showTzInfo, setShowTzInfo] = useState(false);
  const [tzInfoHover, setTzInfoHover] = useState(false);
  const tzInfoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Edit-shield: flow incoming prop changes into the form, but never overwrite the field the
  // user is mid-edit on. Fields commit only on blur/Enter (via EditableField's buffer), so a
  // sibling re-render or the TZ-suggestion timer can no longer wipe an in-progress edit.
  useEffect(() => {
    setFormData(prev => ({
      title: editingField === 'title' ? prev.title : (event.title || ''),
      startDate: editingField === 'startDate' ? prev.startDate : formatDateForInput(event.startDate),
      startTime: editingField === 'startTime' ? prev.startTime : formatTimeForInput(event.startDate),
      endDate: editingField === 'endDate' ? prev.endDate : formatDateForInput(event.endDate),
      endTime: editingField === 'endTime' ? prev.endTime : formatTimeForInput(event.endDate),
      location: editingField === 'location' ? prev.location : (event.location || ''),
      description: editingField === 'description' ? prev.description : (event.description || ''),
      url: editingField === 'url' ? prev.url : (event.url || ''),
      allDay: event.allDay,
    }));
  }, [event, editingField]);

  // Auto-dismiss TZ suggestion after 15s.
  useEffect(() => {
    if (tzSuggestion && onTzSuggestionDismiss) {
      const timer = setTimeout(onTzSuggestionDismiss, 15000);
      return () => clearTimeout(timer);
    }
  }, [tzSuggestion, onTzSuggestionDismiss]);

  const errors = validateEvent({
    title: formData.title,
    startDate: formData.startDate,
    startTime: formData.startTime,
    endDate: formData.endDate,
    endTime: formData.endTime,
    allDay: formData.allDay,
  } satisfies EventFormValues);

  // Build the updated CalendarEvent from a form snapshot and emit it. Non-blocking: we emit
  // even when validation has errors (the errors are surfaced inline) so the parent stays in
  // sync with what the user typed — this is the fix for the lost-keystroke bug.
  const emit = (data: FormData) => {
    const startDateTime = data.allDay
      ? new Date(data.startDate)
      : new Date(`${data.startDate}T${data.startTime}`);
    let endDateTime = data.allDay
      ? new Date(data.endDate)
      : new Date(`${data.endDate}T${data.endTime}`);

    // Enforce start <= end at edit time rather than deferring to export validation (task-195): an
    // end before the start is clamped up to the start.
    if (!isNaN(startDateTime.getTime()) && !isNaN(endDateTime.getTime())) {
      endDateTime = clampEndNotBeforeStart(startDateTime, endDateTime);
    }

    const updatedEvent: CalendarEvent = {
      ...event,
      title: data.title.trim() || event.title,
      startDate: isNaN(startDateTime.getTime()) ? event.startDate : startDateTime,
      endDate: isNaN(endDateTime.getTime()) ? event.endDate : endDateTime,
      location: data.location.trim() || undefined,
      description: data.description.trim() || undefined,
      url: normalizeUrl(data.url),
      allDay: data.allDay,
    };
    // Keep the raw wall-clock fields in sync with the edited instants so a later timezone change
    // reinterprets the EDITED time, not the stale parsed time (same fix as the card). All-day raw
    // is left untouched (timezone-independent).
    onChange(data.allDay ? updatedEvent : resyncRawFields(updatedEvent));
  };

  const handleFieldCommit = (field: keyof FormData, value: string) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
    setEditingField(null);
    emit(updated);
  };

  const handleAllDayToggle = (checked: boolean) => {
    const updated = { ...formData, allDay: checked };
    setFormData(updated);
    emit(updated);
  };

  const handleTimezoneChange = (newTimezone: string) => {
    onTimezoneUserChange?.();

    // Recalculate displayed times from raw dates in the new timezone.
    if (event.rawStartDate && event.rawEndDate && !event.allDay) {
      const newStart = convertRawToDate(event.rawStartDate, newTimezone);
      const newEnd = convertRawToDate(event.rawEndDate, newTimezone);
      onChange({
        ...event,
        timezone: newTimezone,
        startDate: newStart,
        endDate: newEnd,
        timezoneSource: 'user',
        timezoneStatus: 'resolved',
      });
    } else {
      onChange({
        ...event,
        timezone: newTimezone,
        timezoneSource: 'user',
        timezoneStatus: 'resolved',
      });
    }
  };

  const isResolving = event.timezoneStatus === 'resolving';

  const sourceTz = event.timezone || getBrowserTimezone();
  const friendlyTz = friendlyTimezoneLabel(sourceTz);
  const tzInfoLines: string[] = (() => {
    const lines: string[] = [];
    if (event.timezoneStatus === 'unknown') {
      lines.push('Could not determine original timezone.');
    } else if (event.timezoneSource === 'extracted') {
      lines.push(`${friendlyTz} found in event text.`);
    } else if (event.timezoneSource === 'llm') {
      lines.push(`AI detected timezone as ${friendlyTz}.`);
    } else {
      lines.push(`Original timezone: ${friendlyTz}.`);
    }
    if (event.timezoneSource === 'user') {
      lines.push(`Manually set to ${sourceTz.replace('_', ' ')}.`);
    }
    lines.push(`Times shown in your local time.`);
    return lines;
  })();

  return (
    <div className="space-y-2 text-sm">
      {!hideTitle && (
        <div>
          <EditableField
            mode="inline"
            label="Title"
            type="text"
            value={formData.title}
            displayValue={event.title}
            error={errors.title}
            onChange={(v) => handleFieldCommit('title', v)}
          />
        </div>
      )}

      <div className="text-gray-700 leading-relaxed relative">
        <span className="font-semibold">Start:</span>{' '}
        <span onFocusCapture={() => setEditingField('startDate')}>
          <EditableField
            mode="inline"
            label="Start date"
            type="date"
            inlineWidth="140px"
            value={formData.startDate}
            error={errors.startDate}
            onChange={(v) => handleFieldCommit('startDate', v)}
          />
        </span>
        {!formData.allDay && (
          <>
            {' '}at{' '}
            <span onFocusCapture={() => setEditingField('startTime')}>
              <EditableField
                mode="inline"
                label="Start time"
                type="time"
                inlineWidth="100px"
                value={formData.startTime}
                onChange={(v) => handleFieldCommit('startTime', v)}
              />
            </span>
          </>
        )}
        {!formData.allDay && (
          <TimezonePicker
            date={event.startDate}
            value={event.timezone}
            onChange={handleTimezoneChange}
          />
        )}
        {!formData.allDay && isResolving && (
          <span className="inline-block ml-1 w-3 h-3 border border-gray-400 border-t-black rounded-full animate-spin align-middle" />
        )}
        {!formData.allDay && !isResolving && !hideTimezoneInfo && (
          <span
            className="relative inline-block ml-1 align-middle"
            onMouseEnter={() => setTzInfoHover(true)}
            onMouseLeave={() => setTzInfoHover(false)}
          >
            <button
              onClick={() => {
                if (tzInfoTimer.current) clearTimeout(tzInfoTimer.current);
                setShowTzInfo(true);
                tzInfoTimer.current = setTimeout(() => setShowTzInfo(false), 5000);
              }}
              className="text-gray-400 hover:text-gray-600 focus:outline-none"
              aria-label="Timezone info"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clipRule="evenodd" />
              </svg>
            </button>
            {(showTzInfo || tzInfoHover) && (
              <span className="absolute left-0 top-4 z-10 bg-black text-white text-xs rounded px-2 py-1.5 whitespace-nowrap shadow-lg flex flex-col gap-0.5">
                {tzInfoLines.map((line, i) => (
                  <span key={i}>{line}</span>
                ))}
              </span>
            )}
          </span>
        )}

        {/* TZ suggestion pill */}
        {tzSuggestion && onTzSuggestionApply && (
          <span className="ml-2 inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs px-2 py-0.5 rounded-full">
            AI: {tzSuggestion.timezone.split('/').pop()?.replace('_', ' ')}
            <button
              onClick={() => onTzSuggestionApply(tzSuggestion.timezone)}
              className="underline hover:no-underline font-medium"
            >
              Apply
            </button>
            {onTzSuggestionDismiss && (
              <button
                onClick={onTzSuggestionDismiss}
                className="text-blue-400 hover:text-blue-600 ml-0.5"
                aria-label="Dismiss suggestion"
              >
                x
              </button>
            )}
          </span>
        )}
      </div>

      <div className="text-gray-700 leading-relaxed">
        <span className="font-semibold">End:</span>{' '}
        <span onFocusCapture={() => setEditingField('endDate')}>
          <EditableField
            mode="inline"
            label="End date"
            type="date"
            inlineWidth="140px"
            value={formData.endDate}
            error={errors.endDate}
            onChange={(v) => handleFieldCommit('endDate', v)}
          />
        </span>
        {!formData.allDay && (
          <>
            {' '}at{' '}
            <span onFocusCapture={() => setEditingField('endTime')}>
              <EditableField
                mode="inline"
                label="End time"
                type="time"
                inlineWidth="100px"
                value={formData.endTime}
                onChange={(v) => handleFieldCommit('endTime', v)}
              />
            </span>
          </>
        )}
        {!formData.allDay && (
          <TimezonePicker
            date={event.endDate}
            value={event.timezone}
            onChange={handleTimezoneChange}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          id={`allDay-${event.id}`}
          type="checkbox"
          checked={formData.allDay}
          onChange={(e) => handleAllDayToggle(e.target.checked)}
          className="w-4 h-4 border border-black cursor-pointer focus:ring-1 focus:ring-black"
        />
        <label htmlFor={`allDay-${event.id}`} className="text-gray-700 cursor-pointer">
          All-day event
        </label>
      </div>

      {(event.location || editingField === 'location') && (
        <div className="text-gray-700 leading-relaxed">
          <span className="font-semibold">Location:</span>{' '}
          <span onFocusCapture={() => setEditingField('location')}>
            <EditableField
              mode="inline"
              label="Location"
              type="text"
              inlineWidth="calc(100% - 80px)"
              value={formData.location}
              displayValue={event.location}
              onChange={(v) => handleFieldCommit('location', v)}
            />
          </span>
        </div>
      )}

      {(event.description || editingField === 'description') && (
        <div className="text-gray-700">
          <span className="font-semibold">Description:</span>{' '}
          <span onFocusCapture={() => setEditingField('description')}>
            <EditableField
              mode="inline"
              label="Description"
              type="text"
              multiline
              value={formData.description}
              displayValue={event.description}
              onChange={(v) => handleFieldCommit('description', v)}
            />
          </span>
        </div>
      )}

      {event.url && (
        <div className="text-gray-700 leading-relaxed">
          <span className="font-semibold">URL:</span>{' '}
          <URLPill url={event.url} large />
        </div>
      )}

      {showAttachments && event.attachments && event.attachments.length > 0 && (
        <AttachmentList attachments={event.attachments} />
      )}
    </div>
  );
}
