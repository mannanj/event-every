'use client';

import { useState } from 'react';
import { CalendarEvent } from '@/types/event';
import { exportToICS } from '@/services/exporter';

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
    events.forEach((event) => {
      exportToICS(event);
    });
  };

  const currentCount = events.length;
  const showCount = totalExpected !== undefined || isProcessing;

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
          {isProcessing && (
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-black border-t-transparent" />
          )}
        </div>

        {/* Export all button */}
        {events.length > 0 && !isProcessing && (
          <button
            onClick={handleExportAll}
            className="px-4 py-2 bg-black text-white border-2 border-black hover:bg-white hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black"
            aria-label="Export all events"
          >
            Export All ({events.length})
          </button>
        )}
      </div>

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
                className="p-3 cursor-pointer hover:bg-gray-50"
                onClick={() => toggleExpand(event.id)}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
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
