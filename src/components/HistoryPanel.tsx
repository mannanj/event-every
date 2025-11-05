'use client';

import { useState } from 'react';
import { CalendarEvent } from '@/types/event';
import { useHistory } from '@/hooks/useHistory';
import { exportToICS } from '@/services/exporter';

interface HistoryPanelProps {
  onEventSelect?: (event: CalendarEvent) => void;
}

export default function HistoryPanel({ onEventSelect }: HistoryPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { events, isLoading, error, deleteEvent, clearHistory, searchEvents } = useHistory();

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    searchEvents(query);
  };

  const handleExportEvent = (event: CalendarEvent) => {
    const result = exportToICS(event);

    if (!result.success) {
      alert(result.error || 'Failed to export event');
    }
  };

  const handleDeleteEvent = (id: string) => {
    if (confirm('Delete this event from history?')) {
      deleteEvent(id);
    }
  };

  const handleClearHistory = () => {
    if (showClearConfirm) {
      clearHistory();
      setShowClearConfirm(false);
      setSearchQuery('');
    } else {
      setShowClearConfirm(true);
      setTimeout(() => setShowClearConfirm(false), 3000);
    }
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

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 right-4 z-50 bg-black text-white px-4 py-2 border-2 border-black hover:bg-white hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black"
        aria-label={isOpen ? 'Close history' : 'Open history'}
        aria-expanded={isOpen}
      >
        {isOpen ? '✕' : 'History'}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white border-l-2 border-black z-40 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-label="Event History"
        aria-hidden={!isOpen}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b-2 border-black">
            <h2 className="text-2xl font-bold mb-4">Event History</h2>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search events..."
              className="w-full px-4 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-black"
              aria-label="Search events"
            />

            {events.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={handleClearHistory}
                  className={`w-full px-4 py-2 border-2 border-black transition-colors focus:outline-none focus:ring-2 focus:ring-black ${
                    showClearConfirm
                      ? 'bg-black text-white'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                  aria-label="Clear all history"
                >
                  {showClearConfirm ? 'Click again to confirm' : 'Clear All History'}
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {isLoading && (
              <div className="text-center py-8">
                <p className="text-gray-500">Loading events...</p>
              </div>
            )}

            {error && (
              <div className="p-4 border-2 border-black bg-white mb-4" role="alert">
                <p className="font-semibold text-black">Error</p>
                <p className="text-sm text-gray-600">{error}</p>
              </div>
            )}

            {!isLoading && events.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500">
                  {searchQuery ? 'No events found' : 'No events in history'}
                </p>
              </div>
            )}

            <div className="space-y-4">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="border-2 border-black p-4 bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg flex-1">{event.title}</h3>
                    <button
                      onClick={() => handleDeleteEvent(event.id)}
                      className="ml-2 text-black hover:text-gray-600 focus:outline-none"
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

                  <div className="space-y-1 mb-3 text-sm">
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
                      <p className="text-gray-700 line-clamp-2">
                        <span className="font-semibold">Description:</span> {event.description}
                      </p>
                    )}
                    {event.attachments && event.attachments.length > 0 && (
                      <div>
                        <p className="font-semibold text-gray-700">Attachments:</p>
                        {event.attachments.map((attachment, index) => (
                          <p key={attachment.id} className="text-gray-700 text-xs">
                            [{attachment.type === 'original-image' ? 'Image' : attachment.type === 'original-text' ? 'Text' : 'Metadata'} #{index + 1}] {attachment.filename} ({(attachment.size / 1024).toFixed(1)} KB)
                          </p>
                        ))}
                      </div>
                    )}
                    <p className="text-gray-500 text-xs mt-2">
                      Created: {formatDate(event.created)}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleExportEvent(event)}
                      className="flex-1 px-4 py-2 bg-black text-white border-2 border-black hover:bg-white hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                      aria-label={`Export ${event.title}`}
                    >
                      Export
                    </button>
                    {onEventSelect && (
                      <button
                        onClick={() => {
                          onEventSelect(event);
                          setIsOpen(false);
                        }}
                        className="flex-1 px-4 py-2 bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                        aria-label={`Edit ${event.title}`}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
