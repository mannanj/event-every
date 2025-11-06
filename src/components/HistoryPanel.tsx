'use client';

import { useState } from 'react';
import { CalendarEvent } from '@/types/event';
import { useHistory } from '@/hooks/useHistory';
import { exportToICS } from '@/services/exporter';
import InlineEventEditor from './InlineEventEditor';

interface HistoryPanelProps {
  onEventSelect?: (event: CalendarEvent) => void;
}

export default function HistoryPanel({ onEventSelect }: HistoryPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const { events, isLoading, error, deleteEvent, clearHistory, searchEvents, updateEvent } = useHistory();

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
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      deleteEvent(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmId(null);
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
        aria-label={isOpen ? 'Close created events' : 'Open created events'}
        aria-expanded={isOpen}
      >
        {isOpen ? '✕' : 'Created'}
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
        aria-label="Created Events"
        aria-hidden={!isOpen}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b-2 border-black">
            <h2 className="text-2xl font-bold mb-4">Created</h2>

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
                  aria-label="Clear all created events"
                >
                  {showClearConfirm ? 'Click again to confirm' : 'Clear All Created'}
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
                  {searchQuery ? 'No events found' : 'No created events'}
                </p>
              </div>
            )}

            <div className="space-y-4">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="border-2 border-black p-4 bg-white transition-colors"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <InlineEventEditor
                        event={event}
                        onChange={(updatedEvent) => updateEvent(updatedEvent)}
                        showAttachments={true}
                      />
                    </div>
                    <button
                      onClick={() => handleDeleteEvent(event.id)}
                      className="ml-2 text-black hover:text-gray-600 focus:outline-none flex-shrink-0"
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

                  <p className="text-gray-500 text-xs mb-3">
                    Created: {formatDate(event.created)}
                  </p>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleExportEvent(event)}
                      className="flex-1 px-4 py-2 bg-black text-white border-2 border-black hover:bg-white hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                      aria-label={`Export ${event.title}`}
                    >
                      Export
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {deleteConfirmId && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center"
            onClick={cancelDelete}
          >
            <div
              className="bg-white border-2 border-black p-8 max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-center mb-6 font-semibold">
                Do you want to delete this event? This is irreversible.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={cancelDelete}
                  className="flex-1 px-6 py-2 bg-white text-black border-2 border-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                >
                  No
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-6 py-2 bg-black text-white border-2 border-black hover:bg-white hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black"
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
