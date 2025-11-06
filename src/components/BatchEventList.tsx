'use client';

import { useState, useEffect } from 'react';
import { CalendarEvent } from '@/types/event';
import { exportToICS, exportMultipleToICS } from '@/services/exporter';
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
}: BatchEventListProps) {
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [editingField, setEditingField] = useState<{ eventId: string; field: string } | null>(null);

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
      alert('Please select at least one event to export');
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
                      <p className="text-sm text-gray-600 truncate overflow-hidden px-1">
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
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Save button */}
      {events.length > 0 && !isProcessing && (
        <div className="px-4 pt-4 pb-1 border-t-2 border-black">
          <button
            onClick={handleExport}
            disabled={selectedCount === 0}
            className="w-full py-3 px-6 bg-black text-white border-2 border-black hover:bg-white hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-300 disabled:text-gray-500 disabled:border-gray-300 disabled:cursor-not-allowed"
            aria-label={`Save ${selectedCount} event${selectedCount !== 1 ? 's' : ''}`}
          >
            Save {selectedCount > 0 && `(${selectedCount})`}
          </button>
          <div className="text-xs text-center mt-1">
            <p className="text-black">Pick what you want to keep</p>
            {selectedCount < events.length && selectedCount > 0 && (
              <p className="text-red-400">
                {events.length - selectedCount} event{events.length - selectedCount !== 1 ? 's' : ''} will be lost
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
