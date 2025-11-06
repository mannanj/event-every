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
              {/* Compact card view */}
              <div
                className={`p-3 transition-colors duration-200 ${!isNew ? 'hover:bg-gray-50' : ''}`}
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

                    {/* Event info - editable in collapsed view */}
                    <div className="flex-1 min-w-0">
                      {!isExpanded ? (
                        <div onClick={() => toggleExpand(event.id)} className="cursor-pointer">
                          <div className="flex items-center gap-2 mb-1">
                            <div
                              className="font-bold text-base truncate hover:bg-gray-100 px-1 rounded cursor-text"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(event.id);
                              }}
                            >
                              {event.title}
                            </div>
                            {isNew && (
                              <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded flex-shrink-0">
                                NEW
                              </span>
                            )}
                          </div>
                          <p
                            className="text-sm text-gray-600 truncate hover:bg-gray-100 px-1 rounded cursor-text"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(event.id);
                            }}
                          >
                            {formatCompactDate(event.startDate)}
                            {event.location && ` • ${event.location}`}
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base">{event.title}</h3>
                          {isNew && (
                            <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                              NEW
                            </span>
                          )}
                        </div>
                      )}
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
