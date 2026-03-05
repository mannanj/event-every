'use client';

import { useState, useEffect, useRef } from 'react';
import { CalendarEvent } from '@/types/event';
import { exportToICS, exportMultipleToICS } from '@/services/exporter';
import { getTimezoneAbbreviation, convertRawToDate } from '@/utils/timeConversion';
import { getBrowserTimezone } from '@/utils/timezone';

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
import InlineEventEditor from './InlineEventEditor';
import EditableField from './EditableField';

/**
 * Batch event list component for reviewing and exporting multiple events.
 *
 * Workflow: User selects events → Clicks Export → Events saved to history → UI cleared
 * Note: Events are automatically saved to history during export via onExportComplete callback.
 */
interface BatchEventListProps {
  events: CalendarEvent[];
  isProcessing: boolean;
  totalExpected?: number;
  source: 'image' | 'text' | 'url';
  onEdit: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
  onExport: (event: CalendarEvent) => void;
  onCancel: () => void;
  onExportComplete: (events: CalendarEvent[]) => void;
  showHeader?: boolean;
  tzSuggestions?: Record<string, { timezone: string; confidence: number }>;
  onTzSuggestionApply?: (eventId: string, timezone: string) => void;
  onTzSuggestionDismiss?: (eventId: string) => void;
  onTimezoneUserChange?: (eventId: string) => void;
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

export default function BatchEventList({
  events,
  isProcessing,
  totalExpected,
  source,
  onEdit,
  onDelete,
  onExport,
  onCancel,
  onExportComplete,
  showHeader = true,
  tzSuggestions,
  onTzSuggestionApply,
  onTzSuggestionDismiss,
  onTimezoneUserChange,
}: BatchEventListProps) {
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [editingField, setEditingField] = useState<{ eventId: string; field: string } | null>(null);
  const [showTzInfo, setShowTzInfo] = useState<string | null>(null);
  const [tzInfoHover, setTzInfoHover] = useState<string | null>(null);
  const tzInfoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTimezoneChange = (event: CalendarEvent, newTimezone: string) => {
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

  const getTzInfoLines = (event: CalendarEvent) => {
    const sourceTz = event.timezone || getBrowserTimezone();
    const friendlyTz = COMMON_TIMEZONES.find(tz => tz.value === sourceTz)?.label || sourceTz.replace('_', ' ');
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
  };

  useEffect(() => {
    setSelectedEventIds(new Set(events.map((e) => e.id)));
  }, [events]);

  const toggleExpand = (eventId: string) => {
    setExpandedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const toggleSelection = (eventId: string) => {
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const moreThanHalfSelected = selectedEventIds.size > events.length / 2;
    if (moreThanHalfSelected) {
      setSelectedEventIds(new Set());
    } else {
      setSelectedEventIds(new Set(events.map((e) => e.id)));
    }
  };

  const handleFieldEdit = (event: CalendarEvent, field: string, value: string) => {
    let updatedEvent = { ...event };

    if (field === 'title') {
      updatedEvent.title = value;
    } else if (field === 'startDate') {
      const [year, month, day] = value.split('-').map(Number);
      const newDate = new Date(event.startDate);
      newDate.setFullYear(year, month - 1, day);
      updatedEvent.startDate = newDate;
    } else if (field === 'startTime') {
      const [hours, minutes] = value.split(':').map(Number);
      const newDate = new Date(event.startDate);
      newDate.setHours(hours, minutes);
      updatedEvent.startDate = newDate;
    } else if (field === 'location') {
      updatedEvent.location = value.trim() || undefined;
    }

    onEdit(updatedEvent);
  };

  const formatDate = (date: Date) => {
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const formatCompactDate = (date: Date) => {
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const handleExport = () => {
    if (selectedCount === 0) {
      onCancel();
      return;
    }

    const selectedEvents = events.filter((event) => selectedEventIds.has(event.id));
    const result = exportMultipleToICS(selectedEvents);

    if (result.success) {
      onExportComplete(selectedEvents);
    } else {
      alert(`Export failed: ${result.error}`);
    }
  };

  const currentCount = events.length;
  const selectedCount = selectedEventIds.size;
  const moreThanHalfSelected = selectedCount > events.length / 2;
  const selectAllLabel = moreThanHalfSelected ? 'Unselect all' : 'Select all';

  return (
    <>
      {/* Header */}
      {showHeader && (
        <div className="p-4">
          <h2 className="text-lg font-normal text-black">Made some events</h2>
        </div>
      )}

      {/* Event list */}
      <div className="max-h-[80vh] overflow-y-auto">
        {events.map((event, index) => {
          const isExpanded = expandedEventIds.has(event.id);
          const isNew = index === events.length - 1 && isProcessing;

          return (
            <div
              key={event.id}
              className={`transition-all duration-500 border-t-2 border-black ${
                isNew ? 'bg-green-50' : 'bg-white'
              }`}
            >
              {/* Card header - always visible */}
              <div
                className={`p-3 transition-colors duration-200 ${!isNew ? 'hover:bg-gray-100' : ''} cursor-pointer`}
                onClick={() => toggleExpand(event.id)}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={selectedEventIds.has(event.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelection(event.id);
                      }}
                      className="w-5 h-5 border-2 border-black cursor-pointer focus:ring-2 focus:ring-black flex-shrink-0"
                      aria-label={`Select ${event.title}`}
                    />

                    {/* Event info */}
                    <div className="flex-1 min-w-0">
                      {/* Title - editable */}
                      <div className="flex items-center gap-2 mb-1">
                        {editingField?.eventId === event.id && editingField.field === 'title' ? (
                          <input
                            type="text"
                            value={event.title}
                            onChange={(e) => handleFieldEdit(event, 'title', e.target.value)}
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
                            className="font-bold text-base truncate cursor-pointer hover:bg-gray-200 px-1 rounded"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingField({ eventId: event.id, field: 'title' });
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
                        {editingField?.eventId === event.id && editingField.field === 'startDate' ? (
                          <input
                            type="date"
                            value={formatDateForInput(event.startDate)}
                            onChange={(e) => handleFieldEdit(event, 'startDate', e.target.value)}
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
                              setEditingField({ eventId: event.id, field: 'startDate' });
                            }}
                          >
                            {new Intl.DateTimeFormat('en-US', {
                              month: 'short',
                              day: 'numeric',
                            }).format(event.startDate)}
                          </span>
                        )}{' '}
                        at{' '}
                        {editingField?.eventId === event.id && editingField.field === 'startTime' ? (
                          <input
                            type="time"
                            value={formatTimeForInput(event.startDate)}
                            onChange={(e) => handleFieldEdit(event, 'startTime', e.target.value)}
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
                              setEditingField({ eventId: event.id, field: 'startTime' });
                            }}
                          >
                            {new Intl.DateTimeFormat('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                            }).format(event.startDate)}
                          </span>
                        )}
                        {!event.allDay && (
                          <>
                            <span className="group relative inline-block ml-0.5 border-0 border-b border-dotted border-gray-300 hover:border-gray-600 cursor-pointer">
                              <span className="text-gray-400 text-xs pointer-events-none">
                                {getTimezoneAbbreviation(event.startDate, getBrowserTimezone())}
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 4" className="inline-block w-1.5 h-1 ml-0.5 mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor"><path d="M0 0l3 4 3-4z"/></svg>
                              </span>
                              <select
                                value={event.timezone || getBrowserTimezone()}
                                onChange={(e) => { e.stopPropagation(); handleTimezoneChange(event, e.target.value); }}
                                onClick={(e) => e.stopPropagation()}
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
                            {event.timezoneStatus === 'resolving' && (
                              <span className="inline-block ml-0.5 w-2.5 h-2.5 border border-gray-300 border-t-gray-600 rounded-full animate-spin align-middle" />
                            )}
                            {event.timezoneStatus !== 'resolving' && (
                              <span
                                className="relative inline-block ml-0.5 align-middle"
                                onMouseEnter={() => setTzInfoHover(event.id)}
                                onMouseLeave={() => setTzInfoHover(null)}
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (tzInfoTimer.current) clearTimeout(tzInfoTimer.current);
                                    setShowTzInfo(event.id);
                                    tzInfoTimer.current = setTimeout(() => setShowTzInfo(null), 5000);
                                  }}
                                  className="text-gray-300 hover:text-gray-500 focus:outline-none"
                                  aria-label="Timezone info"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                                    <path fillRule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clipRule="evenodd" />
                                  </svg>
                                </button>
                                {(showTzInfo === event.id || tzInfoHover === event.id) && (
                                  <span className="absolute left-0 bottom-full mb-1 z-50 bg-black text-white text-xs rounded px-2 py-1.5 whitespace-nowrap shadow-lg flex flex-col gap-0.5">
                                    {getTzInfoLines(event).map((line, i) => (
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
                            {editingField?.eventId === event.id && editingField.field === 'location' ? (
                              <input
                                type="text"
                                value={event.location}
                                onChange={(e) => handleFieldEdit(event, 'location', e.target.value)}
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
                                  setEditingField({ eventId: event.id, field: 'location' });
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
                      toggleExpand(event.id);
                    }}
                  >
                    <svg
                      className={`w-5 h-5 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
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
                  <InlineEventEditor
                    event={event}
                    onChange={(updatedEvent) => {
                      onEdit(updatedEvent);
                    }}
                    showAttachments={true}
                    hideTitle={true}
                    hideTimezoneInfo={true}
                    tzSuggestion={tzSuggestions?.[event.id]}
                    onTzSuggestionApply={onTzSuggestionApply ? (tz) => onTzSuggestionApply(event.id, tz) : undefined}
                    onTzSuggestionDismiss={onTzSuggestionDismiss ? () => onTzSuggestionDismiss(event.id) : undefined}
                    onTimezoneUserChange={onTimezoneUserChange ? () => onTimezoneUserChange(event.id) : undefined}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Save/Delete button */}
      {events.length > 0 && !isProcessing && (
        <div className="px-4 pt-4 pb-1 border-t-2 border-black">
          <button
            onClick={handleExport}
            className={`w-full py-3 px-6 border-2 transition-colors focus:outline-none focus:ring-2 ${
              selectedCount === 0
                ? 'bg-red-500 text-white border-red-500 hover:bg-red-600 hover:border-red-600 focus:ring-red-500'
                : 'bg-black text-white border-black hover:bg-white hover:text-black focus:ring-black'
            }`}
            aria-label={selectedCount === 0 ? 'Discard all events' : `Save ${selectedCount} event${selectedCount !== 1 ? 's' : ''}`}
          >
            {selectedCount === 0 ? 'Discard all' : `Save (${selectedCount})`}
          </button>
          <div className="text-xs text-center mt-1">
            <p className="text-black">
              Pick what you want to keep •{' '}
              <button
                onClick={toggleSelectAll}
                className="underline hover:no-underline focus:outline-none"
                aria-label={selectAllLabel}
              >
                {selectAllLabel}
              </button>
              {selectedCount < events.length && (
                <>
                  {' '}•{' '}
                  <span className="text-red-400">
                    {events.length - selectedCount} event{events.length - selectedCount !== 1 ? 's' : ''} will be lost
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
