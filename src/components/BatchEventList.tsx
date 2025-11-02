'use client';

import { useState } from 'react';
import { CalendarEvent } from '@/types/event';
import { exportToICS, exportMultipleToICS } from '@/services/exporter';

interface BatchEventListProps {
  events: CalendarEvent[];
  isProcessing: boolean;
  totalExpected?: number;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
  onExport: (event: CalendarEvent) => void;
}

export default function BatchEventList({
  events,
  isProcessing,
  totalExpected,
  onEdit,
  onDelete,
  onExport,
}: BatchEventListProps) {
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [isBulkEditMode, setIsBulkEditMode] = useState(false);
  const [bulkEditLocation, setBulkEditLocation] = useState('');
  const [bulkEditDescription, setBulkEditDescription] = useState('');

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

  const selectAll = () => {
    setSelectedEventIds(new Set(events.map((e) => e.id)));
  };

  const deselectAll = () => {
    setSelectedEventIds(new Set());
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const formatCompactDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const handleExportAll = () => {
    const result = exportMultipleToICS(events);
    if (!result.success) {
      alert(`Export failed: ${result.error}`);
    }
  };

  const handleExportSelected = () => {
    if (selectedCount === 0) {
      alert('Please select at least one event to export');
      return;
    }

    const selectedEvents = events.filter((event) => selectedEventIds.has(event.id));
    const result = exportMultipleToICS(selectedEvents);
    if (!result.success) {
      alert(`Export failed: ${result.error}`);
    }
  };

  const openBulkEditMode = () => {
    if (selectedCount === 0) {
      alert('Please select at least one event to edit');
      return;
    }
    setIsBulkEditMode(true);
    setBulkEditLocation('');
    setBulkEditDescription('');
  };

  const cancelBulkEdit = () => {
    setIsBulkEditMode(false);
    setBulkEditLocation('');
    setBulkEditDescription('');
  };

  const applyBulkEdit = () => {
    if (selectedCount === 0) return;

    const selectedEvents = events.filter((event) => selectedEventIds.has(event.id));

    selectedEvents.forEach((event) => {
      const updatedEvent = { ...event };

      if (bulkEditLocation.trim() !== '') {
        updatedEvent.location = bulkEditLocation.trim();
      }

      if (bulkEditDescription.trim() !== '') {
        updatedEvent.description = bulkEditDescription.trim();
      }

      onEdit(updatedEvent);
    });

    setIsBulkEditMode(false);
    setBulkEditLocation('');
    setBulkEditDescription('');
  };

  const currentCount = events.length;
  const selectedCount = selectedEventIds.size;
  const showCount = totalExpected !== undefined || isProcessing;
  const allSelected = events.length > 0 && selectedCount === events.length;

  return (
    <div className="space-y-4">
      {/* Header with count indicator */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-black">
            {isProcessing ? 'Processing Batch' : 'Batch Events'}
          </h2>
          {showCount && (
            <div className="text-sm text-gray-600">
              {isProcessing ? (
                <>
                  <span className="font-semibold">{currentCount}</span> event
                  {currentCount !== 1 ? 's' : ''} found
                  {totalExpected && totalExpected > currentCount && (
                    <>, processing more...</>
                  )}
                </>
              ) : (
                <>
                  <span className="font-semibold">{currentCount}</span> event
                  {currentCount !== 1 ? 's' : ''}
                </>
              )}
            </div>
          )}
          {selectedCount > 0 && (
            <div className="text-sm text-black font-semibold">
              {selectedCount} selected
            </div>
          )}
          {isProcessing && (
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-black border-t-transparent" />
          )}
        </div>

        {/* Selection and export controls */}
        {events.length > 0 && !isProcessing && (
          <div className="flex gap-2">
            <button
              onClick={allSelected ? deselectAll : selectAll}
              className="px-4 py-2 bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black"
              aria-label={allSelected ? 'Deselect all events' : 'Select all events'}
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
            {selectedCount > 0 && (
              <>
                <button
                  onClick={openBulkEditMode}
                  className="px-4 py-2 bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                  aria-label={`Bulk edit ${selectedCount} selected event${selectedCount !== 1 ? 's' : ''}`}
                >
                  Bulk Edit ({selectedCount})
                </button>
                <button
                  onClick={handleExportSelected}
                  className="px-4 py-2 bg-black text-white border-2 border-black hover:bg-white hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                  aria-label={`Export ${selectedCount} selected event${selectedCount !== 1 ? 's' : ''}`}
                >
                  Export Selected ({selectedCount})
                </button>
              </>
            )}
            <button
              onClick={handleExportAll}
              className="px-4 py-2 bg-black text-white border-2 border-black hover:bg-white hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black"
              aria-label="Export all events"
            >
              Export All ({events.length})
            </button>
          </div>
        )}
      </div>

      {/* Bulk Edit Modal */}
      {isBulkEditMode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white border-4 border-black p-6 max-w-lg w-full mx-4">
            <h3 className="text-xl font-bold text-black mb-4">
              Bulk Edit {selectedCount} Event{selectedCount !== 1 ? 's' : ''}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Enter values to apply to all selected events. Leave blank to keep existing values.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label htmlFor="bulk-location" className="block text-sm font-semibold text-black mb-1">
                  Location
                </label>
                <input
                  id="bulk-location"
                  type="text"
                  value={bulkEditLocation}
                  onChange={(e) => setBulkEditLocation(e.target.value)}
                  placeholder="Enter location for all selected events"
                  className="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div>
                <label htmlFor="bulk-description" className="block text-sm font-semibold text-black mb-1">
                  Description
                </label>
                <textarea
                  id="bulk-description"
                  value={bulkEditDescription}
                  onChange={(e) => setBulkEditDescription(e.target.value)}
                  placeholder="Enter description for all selected events"
                  rows={4}
                  className="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-black resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={applyBulkEdit}
                className="flex-1 px-4 py-2 bg-black text-white border-2 border-black hover:bg-white hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black"
              >
                Apply Changes
              </button>
              <button
                onClick={cancelBulkEdit}
                className="flex-1 px-4 py-2 bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event list */}
      <div className="space-y-2">
        {events.map((event, index) => {
          const isExpanded = expandedEventIds.has(event.id);
          const isNew = index === events.length - 1 && isProcessing;

          return (
            <div
              key={event.id}
              className={`border-2 border-black transition-all ${
                isNew ? 'bg-green-50 animate-pulse' : 'bg-white'
              }`}
            >
              {/* Compact card view */}
              <div
                className="p-3 hover:bg-gray-50"
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
                      className="w-5 h-5 border-2 border-black cursor-pointer focus:ring-2 focus:ring-black"
                      aria-label={`Select ${event.title}`}
                    />

                    {/* Event info */}
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => toggleExpand(event.id)}
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base truncate">{event.title}</h3>
                        {isNew && (
                          <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                            NEW
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 truncate">
                        {formatCompactDate(event.startDate)}
                        {event.location && ` • ${event.location}`}
                      </p>
                    </div>
                  </div>

                  {/* Expand/collapse icon */}
                  <button
                    className="p-1 hover:bg-gray-200 rounded transition-colors focus:outline-none"
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

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t-2 border-black p-4 bg-white">
                  <div className="space-y-2 mb-4 text-sm">
                    <p className="text-gray-700">
                      <span className="font-semibold">Start:</span> {formatDate(event.startDate)}
                    </p>
                    <p className="text-gray-700">
                      <span className="font-semibold">End:</span> {formatDate(event.endDate)}
                    </p>
                    {event.location && (
                      <p className="text-gray-700">
                        <span className="font-semibold">Location:</span> {event.location}
                      </p>
                    )}
                    {event.description && (
                      <p className="text-gray-700">
                        <span className="font-semibold">Description:</span> {event.description}
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onExport(event);
                      }}
                      className="flex-1 px-3 py-2 bg-black text-white border-2 border-black hover:bg-white hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black text-sm"
                      aria-label={`Export ${event.title}`}
                    >
                      Export
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(event);
                      }}
                      className="flex-1 px-3 py-2 bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black text-sm"
                      aria-label={`Edit ${event.title}`}
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(event.id);
                      }}
                      className="px-3 py-2 bg-white text-black border-2 border-black hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-black text-sm"
                      aria-label={`Delete ${event.title}`}
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
