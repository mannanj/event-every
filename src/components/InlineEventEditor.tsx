'use client';

import { useState, useEffect, useRef } from 'react';
import { CalendarEvent } from '@/types/event';
import { downloadAttachment } from '@/utils/downloadAttachment';
import { getTimezoneAbbreviation } from '@/utils/timeConversion';
import { convertRawToDate } from '@/utils/timeConversion';
import { getBrowserTimezone } from '@/utils/timezone';
import URLPill from './URLPill';

const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Europe/Athens', label: 'Athens' },
  { value: 'Asia/Kolkata', label: 'India' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Seoul', label: 'Seoul' },
  { value: 'Asia/Shanghai', label: 'China' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Pacific/Auckland', label: 'Auckland' },
];

interface InlineEventEditorProps {
  event: CalendarEvent;
  onChange: (updatedEvent: CalendarEvent) => void;
  showAttachments?: boolean;
  hideTitle?: boolean;
  tzSuggestion?: { timezone: string; confidence: number };
  onTzSuggestionApply?: (timezone: string) => void;
  onTzSuggestionDismiss?: () => void;
  onTimezoneUserChange?: () => void;
  hideTimezoneInfo?: boolean;
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeForInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatDateDisplay(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export default function InlineEventEditor({
  event,
  onChange,
  showAttachments = true,
  hideTitle = false,
  tzSuggestion,
  onTzSuggestionApply,
  onTzSuggestionDismiss,
  onTimezoneUserChange,
  hideTimezoneInfo = false,
}: InlineEventEditorProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [showTzInfo, setShowTzInfo] = useState(false);
  const [tzInfoHover, setTzInfoHover] = useState(false);
  const tzInfoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [formData, setFormData] = useState({
    title: event.title || '',
    startDate: formatDateForInput(event.startDate),
    startTime: formatTimeForInput(event.startDate),
    endDate: formatDateForInput(event.endDate),
    endTime: formatTimeForInput(event.endDate),
    location: event.location || '',
    description: event.description || '',
  });

  const titleInputRef = useRef<HTMLInputElement>(null);
  const startDateInputRef = useRef<HTMLInputElement>(null);
  const startTimeInputRef = useRef<HTMLInputElement>(null);
  const endDateInputRef = useRef<HTMLInputElement>(null);
  const endTimeInputRef = useRef<HTMLInputElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setFormData(prev => ({
      title: editingField === 'title' ? prev.title : (event.title || ''),
      startDate: editingField === 'startDate' ? prev.startDate : formatDateForInput(event.startDate),
      startTime: editingField === 'startTime' ? prev.startTime : formatTimeForInput(event.startDate),
      endDate: editingField === 'endDate' ? prev.endDate : formatDateForInput(event.endDate),
      endTime: editingField === 'endTime' ? prev.endTime : formatTimeForInput(event.endDate),
      location: editingField === 'location' ? prev.location : (event.location || ''),
      description: editingField === 'description' ? prev.description : (event.description || ''),
    }));
  }, [event, editingField]);

  useEffect(() => {
    if (editingField === 'title' && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    } else if (editingField === 'startDate' && startDateInputRef.current) {
      startDateInputRef.current.focus();
    } else if (editingField === 'startTime' && startTimeInputRef.current) {
      startTimeInputRef.current.focus();
    } else if (editingField === 'endDate' && endDateInputRef.current) {
      endDateInputRef.current.focus();
    } else if (editingField === 'endTime' && endTimeInputRef.current) {
      endTimeInputRef.current.focus();
    } else if (editingField === 'location' && locationInputRef.current) {
      locationInputRef.current.focus();
      locationInputRef.current.select();
    } else if (editingField === 'description' && descriptionInputRef.current) {
      descriptionInputRef.current.focus();
      descriptionInputRef.current.select();
    }
  }, [editingField]);

  // Auto-dismiss TZ suggestion after 15s
  useEffect(() => {
    if (tzSuggestion && onTzSuggestionDismiss) {
      const timer = setTimeout(onTzSuggestionDismiss, 15000);
      return () => clearTimeout(timer);
    }
  }, [tzSuggestion, onTzSuggestionDismiss]);

  const handleFieldChange = (field: string, value: string) => {
    const updatedFormData = { ...formData, [field]: value };
    setFormData(updatedFormData);

    const startDateTime = new Date(`${updatedFormData.startDate}T${updatedFormData.startTime}`);
    const endDateTime = new Date(`${updatedFormData.endDate}T${updatedFormData.endTime}`);

    if (!isNaN(startDateTime.getTime()) && !isNaN(endDateTime.getTime())) {
      const updatedEvent: CalendarEvent = {
        ...event,
        title: updatedFormData.title.trim() || event.title,
        startDate: startDateTime,
        endDate: endDateTime,
        location: updatedFormData.location.trim() || undefined,
        description: updatedFormData.description || undefined,
      };
      onChange(updatedEvent);
    }
  };

  const handleTimezoneChange = (newTimezone: string) => {
    onTimezoneUserChange?.();

    // Recalculate displayed times from raw dates in new timezone
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

  // Always show browser timezone abbreviation since times are displayed in local time
  const tzAbbr = getTimezoneAbbreviation(event.startDate, getBrowserTimezone());

  const isResolving = event.timezoneStatus === 'resolving';

  const sourceTz = event.timezone || getBrowserTimezone();
  const friendlyTz = COMMON_TIMEZONES.find(tz => tz.value === sourceTz)?.label || sourceTz.replace('_', ' ');
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
          {editingField === 'title' ? (
            <input
              ref={titleInputRef}
              type="text"
              value={formData.title}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              onBlur={() => setEditingField(null)}
              className="font-bold text-base border border-black px-1 py-0 focus:outline-none focus:ring-1 focus:ring-black w-full"
            />
          ) : (
            <h3
              onClick={() => setEditingField('title')}
              className="font-bold text-base cursor-pointer hover:bg-gray-200 rounded"
            >
              {event.title}
            </h3>
          )}
        </div>
      )}

      <div className="text-gray-700 leading-relaxed relative">
        <span className="font-semibold">Start:</span>{' '}
        {editingField === 'startDate' ? (
          <input
            ref={startDateInputRef}
            type="date"
            value={formData.startDate}
            onChange={(e) => handleFieldChange('startDate', e.target.value)}
            onBlur={() => setEditingField(null)}
            className="inline-block border border-black px-1 text-sm focus:outline-none focus:ring-1 focus:ring-black align-baseline"
            style={{ height: '1.5rem', lineHeight: '1.5rem', verticalAlign: 'baseline', width: '140px' }}
          />
        ) : (
          <span
            onClick={() => setEditingField('startDate')}
            className="cursor-pointer hover:bg-gray-200 px-1 rounded"
          >
            {formatDateDisplay(event.startDate).split(' at ')[0]}
          </span>
        )}{' '}
        at{' '}
        {editingField === 'startTime' ? (
          <input
            ref={startTimeInputRef}
            type="time"
            value={formData.startTime}
            onChange={(e) => handleFieldChange('startTime', e.target.value)}
            onBlur={() => setEditingField(null)}
            className="inline-block border border-black px-1 text-sm focus:outline-none focus:ring-1 focus:ring-black align-baseline"
            style={{ height: '1.5rem', lineHeight: '1.5rem', verticalAlign: 'baseline', width: '100px' }}
          />
        ) : (
          <span
            onClick={() => setEditingField('startTime')}
            className="cursor-pointer hover:bg-gray-200 px-1 rounded"
          >
            {formatDateDisplay(event.startDate).split(' at ')[1]}
          </span>
        )}
        {!event.allDay && (
          <span className="group relative inline-block ml-0.5 border-0 border-b border-dotted border-gray-400 hover:border-black cursor-pointer">
            <span className="text-gray-500 text-sm pointer-events-none">{tzAbbr}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 4" className="inline-block w-1.5 h-1 ml-0.5 mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor"><path d="M0 0l3 4 3-4z"/></svg></span>
            <select
              value={event.timezone || getBrowserTimezone()}
              onChange={(e) => handleTimezoneChange(e.target.value)}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
            >
              {COMMON_TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>
                  {(() => {
                    const abbr = getTimezoneAbbreviation(event.startDate, tz.value);
                    return abbr === tz.label ? tz.label : `${tz.label} (${abbr})`;
                  })()}
                </option>
              ))}
            </select>
          </span>
        )}
        {!event.allDay && isResolving && (
          <span className="inline-block ml-1 w-3 h-3 border border-gray-400 border-t-black rounded-full animate-spin align-middle" />
        )}
        {!event.allDay && !isResolving && !hideTimezoneInfo && (
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
        {editingField === 'endDate' ? (
          <input
            ref={endDateInputRef}
            type="date"
            value={formData.endDate}
            onChange={(e) => handleFieldChange('endDate', e.target.value)}
            onBlur={() => setEditingField(null)}
            className="inline-block border border-black px-1 text-sm focus:outline-none focus:ring-1 focus:ring-black align-baseline"
            style={{ height: '1.5rem', lineHeight: '1.5rem', verticalAlign: 'baseline', width: '140px' }}
          />
        ) : (
          <span
            onClick={() => setEditingField('endDate')}
            className="cursor-pointer hover:bg-gray-200 px-1 rounded"
          >
            {formatDateDisplay(event.endDate).split(' at ')[0]}
          </span>
        )}{' '}
        at{' '}
        {editingField === 'endTime' ? (
          <input
            ref={endTimeInputRef}
            type="time"
            value={formData.endTime}
            onChange={(e) => handleFieldChange('endTime', e.target.value)}
            onBlur={() => setEditingField(null)}
            className="inline-block border border-black px-1 text-sm focus:outline-none focus:ring-1 focus:ring-black align-baseline"
            style={{ height: '1.5rem', lineHeight: '1.5rem', verticalAlign: 'baseline', width: '100px' }}
          />
        ) : (
          <span
            onClick={() => setEditingField('endTime')}
            className="cursor-pointer hover:bg-gray-200 px-1 rounded"
          >
            {formatDateDisplay(event.endDate).split(' at ')[1]}
          </span>
        )}
        {!event.allDay && (
          <span className="group relative inline-block ml-0.5 border-0 border-b border-dotted border-gray-400 hover:border-black cursor-pointer">
            <span className="text-gray-500 text-sm pointer-events-none">{tzAbbr}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 4" className="inline-block w-1.5 h-1 ml-0.5 mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor"><path d="M0 0l3 4 3-4z"/></svg></span>
            <select
              value={event.timezone || getBrowserTimezone()}
              onChange={(e) => handleTimezoneChange(e.target.value)}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
            >
              {COMMON_TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>
                  {(() => {
                    const abbr = getTimezoneAbbreviation(event.startDate, tz.value);
                    return abbr === tz.label ? tz.label : `${tz.label} (${abbr})`;
                  })()}
                </option>
              ))}
            </select>
          </span>
        )}
      </div>


      {(event.location || editingField === 'location') && (
        <div className="text-gray-700 leading-relaxed">
          <span className="font-semibold">Location:</span>{' '}
          {editingField === 'location' ? (
            <input
              ref={locationInputRef}
              type="text"
              value={formData.location}
              onChange={(e) => handleFieldChange('location', e.target.value)}
              onBlur={() => setEditingField(null)}
              className="inline-block border border-black px-1 text-sm focus:outline-none focus:ring-1 focus:ring-black align-baseline"
              style={{ height: '1.5rem', lineHeight: '1.5rem', verticalAlign: 'baseline', width: 'calc(100% - 80px)', minWidth: '200px', maxWidth: '100%' }}
            />
          ) : (
            <span
              onClick={() => setEditingField('location')}
              className="cursor-pointer hover:bg-gray-200 px-1 rounded"
            >
              {event.location}
            </span>
          )}
        </div>
      )}

      {(event.description || editingField === 'description') && (
        <div className="text-gray-700">
          <span className="font-semibold">Description:</span>{' '}
          {editingField === 'description' ? (
            <textarea
              ref={descriptionInputRef}
              value={formData.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              onBlur={() => setEditingField(null)}
              className="block w-full border border-black px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-black mt-1"
              rows={3}
            />
          ) : (
            <span
              onClick={() => setEditingField('description')}
              className="cursor-pointer hover:bg-gray-200 px-1 rounded"
            >
              {event.description}
            </span>
          )}
        </div>
      )}

      {event.url && (
        <div className="text-gray-700 leading-relaxed">
          <span className="font-semibold">URL:</span>{' '}
          <URLPill url={event.url} large />
        </div>
      )}

      {showAttachments && event.attachments && event.attachments.length > 0 && (
        <div>
          <p className="font-semibold text-gray-700">Attachments:</p>
          <div className="space-y-1">
            {event.attachments.map((attachment, index) => (
              <button
                key={attachment.id}
                onClick={() => downloadAttachment(attachment)}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline cursor-pointer text-left block"
              >
                [{ attachment.type === 'original-image'
                  ? 'Image'
                  : attachment.type === 'original-text'
                  ? 'Text'
                  : 'Metadata'
                } #{index + 1}] {attachment.filename} ({(attachment.size / 1024).toFixed(1)} KB)
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
