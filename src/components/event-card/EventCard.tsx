'use client';

import { memo, useState, useRef } from 'react';
import { CalendarEvent } from '@/types/event';
import { convertRawToDate, formatDateForInput, formatTimeForInput, resyncRawFields, shiftEndPreservingDuration } from '@/utils/timeConversion';
import { getBrowserTimezone } from '@/utils/timezone';
import EventFields from '@/components/EventFields';
import TimezonePicker, { friendlyTimezoneLabel } from '@/components/TimezonePicker';

// Hoisted to module scope: building these per-render (once per card) was ~190 Intl
// allocations every few seconds while the message-rotation timer churned the list.
const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const TIME_FMT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

interface EventCardProps {
  event: CalendarEvent;
  selected: boolean;
  isNew: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (event: CalendarEvent) => void;
  tzSuggestion?: { timezone: string; confidence: number };
  onTzSuggestionApply?: (eventId: string, timezone: string) => void;
  onTzSuggestionDismiss?: (eventId: string) => void;
  onTimezoneUserChange?: (eventId: string) => void;
}

function buildTzInfoLines(event: CalendarEvent): string[] {
  const sourceTz = event.timezone || getBrowserTimezone();
  const friendlyTz = friendlyTimezoneLabel(sourceTz);
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
  lines.push('Times shown in your local time.');
  return lines;
}

function EventCard({
  event,
  selected,
  isNew,
  onToggleSelect,
  onEdit,
  tzSuggestion,
  onTzSuggestionApply,
  onTzSuggestionDismiss,
  onTimezoneUserChange,
}: EventCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [showTzInfo, setShowTzInfo] = useState(false);
  const [tzInfoHover, setTzInfoHover] = useState(false);
  const tzInfoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleExpand = () => setIsExpanded((prev) => !prev);

  const handleTimezoneChange = (newTimezone: string) => {
    if (event.rawStartDate && event.rawEndDate && !event.allDay) {
      const newStart = convertRawToDate(event.rawStartDate, newTimezone);
      const newEnd = convertRawToDate(event.rawEndDate, newTimezone);
      onEdit({
        ...event,
        timezone: newTimezone,
        startDate: newStart,
        endDate: newEnd,
        timezoneSource: 'user',
        timezoneStatus: 'resolved',
      });
    } else {
      onEdit({
        ...event,
        timezone: newTimezone,
        timezoneSource: 'user',
        timezoneStatus: 'resolved',
      });
    }
  };

  const handleFieldEdit = (field: string, value: string) => {
    if (field === 'title') {
      onEdit({ ...event, title: value });
      return;
    }
    if (field === 'location') {
      onEdit({ ...event, location: value.trim() || undefined });
      return;
    }

    // Date/time edits happen in the browser-local zone (the card shows local time). Rebuild the
    // start instant, shift the end to preserve duration (so start can never pass end), then resync
    // the raw wall-clock fields — otherwise a later timezone change re-derives from the STALE parsed
    // raw and silently reverts this edit (task-195).
    const newStart = new Date(event.startDate);
    if (field === 'startDate') {
      const [year, month, day] = value.split('-').map(Number);
      if ([year, month, day].some(Number.isNaN)) return;
      newStart.setFullYear(year, month - 1, day);
    } else if (field === 'startTime') {
      const [hours, minutes] = value.split(':').map(Number);
      if ([hours, minutes].some(Number.isNaN)) return;
      newStart.setHours(hours, minutes);
    } else {
      return;
    }

    const newEnd = shiftEndPreservingDuration(event.startDate, event.endDate, newStart);
    onEdit(resyncRawFields({ ...event, startDate: newStart, endDate: newEnd }));
  };

  return (
    <div
      data-testid="event-card"
      className={`transition-all duration-500 border-t-2 border-black ${
        isNew ? 'bg-green-50' : 'bg-white'
      }`}
    >
      {/* Card header - always visible */}
      <div
        className={`p-3 transition-colors duration-200 ${!isNew ? 'hover:bg-gray-100' : ''} cursor-pointer`}
        onClick={toggleExpand}
      >
        <div className="flex justify-between items-start gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Checkbox */}
            <input
              type="checkbox"
              checked={selected}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelect(event.id);
              }}
              className="w-5 h-5 border-2 border-black cursor-pointer focus:ring-2 focus:ring-black flex-shrink-0"
              aria-label={`Select ${event.title}`}
            />

            {/* Event info */}
            <div className="flex-1 min-w-0">
              {/* Title - editable */}
              <div className="flex items-center gap-2 mb-1">
                {editingField === 'title' ? (
                  <input
                    type="text"
                    data-testid="event-card-title-input"
                    value={event.title}
                    onChange={(e) => handleFieldEdit('title', e.target.value)}
                    onBlur={() => setEditingField(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        setEditingField(null);
                      }
                    }}
                    className="font-bold text-base border border-black px-1 py-0 focus:outline-none focus:ring-1 focus:ring-black flex-1"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <h3
                    data-testid="event-card-title"
                    className="font-bold text-base truncate cursor-pointer hover:bg-gray-200 px-1 rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingField('title');
                    }}
                  >
                    {event.title}
                  </h3>
                )}
                {isNew && (
                  <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded flex-shrink-0">
                    NEW
                  </span>
                )}
              </div>

              {/* Date, Time, Location - always visible on one line, editable */}
              <p className="text-sm text-gray-600 px-1 overflow-visible">
                {editingField === 'startDate' ? (
                  <input
                    type="date"
                    data-testid="event-card-date-input"
                    value={formatDateForInput(event.startDate)}
                    onChange={(e) => handleFieldEdit('startDate', e.target.value)}
                    onBlur={() => setEditingField(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        setEditingField(null);
                      }
                    }}
                    className="border border-black px-1 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                    style={{ width: '140px' }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="cursor-pointer hover:bg-gray-200 rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingField('startDate');
                    }}
                  >
                    {DATE_FMT.format(event.startDate)}
                  </span>
                )}{' '}
                at{' '}
                {editingField === 'startTime' ? (
                  <input
                    type="time"
                    data-testid="event-card-time-input"
                    value={formatTimeForInput(event.startDate)}
                    onChange={(e) => handleFieldEdit('startTime', e.target.value)}
                    onBlur={() => setEditingField(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        setEditingField(null);
                      }
                    }}
                    className="border border-black px-1 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                    style={{ width: '100px' }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="cursor-pointer hover:bg-gray-200 rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingField('startTime');
                    }}
                  >
                    {TIME_FMT.format(event.startDate)}
                  </span>
                )}
                {!event.allDay && (
                  <>
                    <span onClick={(e) => e.stopPropagation()} className="inline-block align-middle">
                      <TimezonePicker
                        date={event.startDate}
                        value={event.timezone}
                        onChange={handleTimezoneChange}
                      />
                    </span>
                    {event.timezoneStatus === 'resolving' && (
                      <span className="inline-block ml-0.5 w-2.5 h-2.5 border border-gray-300 border-t-gray-600 rounded-full animate-spin align-middle" />
                    )}
                    {event.timezoneStatus !== 'resolving' && (
                      <span
                        className="relative inline-block ml-0.5 align-middle"
                        onMouseEnter={() => setTzInfoHover(true)}
                        onMouseLeave={() => setTzInfoHover(false)}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (tzInfoTimer.current) clearTimeout(tzInfoTimer.current);
                            setShowTzInfo(true);
                            tzInfoTimer.current = setTimeout(() => setShowTzInfo(false), 5000);
                          }}
                          className="text-gray-300 hover:text-gray-500 focus:outline-none"
                          aria-label="Timezone info"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                            <path fillRule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clipRule="evenodd" />
                          </svg>
                        </button>
                        {(showTzInfo || tzInfoHover) && (
                          <span className="absolute left-0 bottom-full mb-1 z-50 bg-black text-white text-xs rounded px-2 py-1.5 whitespace-nowrap shadow-lg flex flex-col gap-0.5">
                            {buildTzInfoLines(event).map((line, i) => (
                              <span key={i}>{line}</span>
                            ))}
                          </span>
                        )}
                      </span>
                    )}
                  </>
                )}
                {event.location && (
                  <>
                    {' '}•{' '}
                    {editingField === 'location' ? (
                      <input
                        type="text"
                        value={event.location}
                        onChange={(e) => handleFieldEdit('location', e.target.value)}
                        onBlur={() => setEditingField(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') {
                            setEditingField(null);
                          }
                        }}
                        className="border border-black px-1 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                        style={{ minWidth: '150px', maxWidth: '400px' }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className="cursor-pointer hover:bg-gray-200 rounded"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingField('location');
                        }}
                      >
                        {event.location}
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Expand/collapse icon */}
          <button
            className="p-1 hover:bg-gray-200 rounded transition-colors focus:outline-none flex-shrink-0"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand();
            }}
          >
            <svg
              className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded details with inline editing */}
      {isExpanded && (
        <div className="border-t-2 border-black p-4 bg-gray-50">
          <EventFields
            mode="inline"
            event={event}
            onChange={(updatedEvent) => {
              onEdit(updatedEvent);
            }}
            showAttachments={true}
            hideTitle={true}
            hideTimezoneInfo={true}
            tzSuggestion={tzSuggestion}
            onTzSuggestionApply={onTzSuggestionApply ? (tz) => onTzSuggestionApply(event.id, tz) : undefined}
            onTzSuggestionDismiss={onTzSuggestionDismiss ? () => onTzSuggestionDismiss(event.id) : undefined}
            onTimezoneUserChange={onTimezoneUserChange ? () => onTimezoneUserChange(event.id) : undefined}
          />
        </div>
      )}
    </div>
  );
}

export default memo(EventCard);
