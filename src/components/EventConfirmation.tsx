'use client';

import { CalendarEvent } from '@/types/event';

interface EventConfirmationProps {
  event: CalendarEvent;
  onEdit: () => void;
  onExport: () => void;
}

export default function EventConfirmation({ event, onEdit, onExport }: EventConfirmationProps) {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  };

  return (
    <div className="bg-white border-2 border-black p-6 space-y-6">
      <div className="border-b-2 border-black pb-4">
        <h2 className="text-2xl font-bold text-black mb-1">Event Confirmed</h2>
        <p className="text-sm text-gray-600">Review the details below</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">TITLE</label>
          <p className="text-lg font-semibold text-black">{event.title}</p>
        </div>

        {event.allDay ? (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">DATE</label>
            <p className="text-base text-black">{formatDate(event.startDate)}</p>
            {event.startDate.toDateString() !== event.endDate.toDateString() && (
              <p className="text-sm text-gray-600">to {formatDate(event.endDate)}</p>
            )}
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">START</label>
              <p className="text-base text-black">
                {formatDate(event.startDate)}
              </p>
              <p className="text-base text-black font-medium">{formatTime(event.startDate)}</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">END</label>
              <p className="text-base text-black">
                {formatDate(event.endDate)}
              </p>
              <p className="text-base text-black font-medium">{formatTime(event.endDate)}</p>
            </div>
          </>
        )}

        {event.location && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">LOCATION</label>
            <p className="text-base text-black">{event.location}</p>
          </div>
        )}

        {event.description && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">DESCRIPTION</label>
            <p className="text-base text-black whitespace-pre-wrap">{event.description}</p>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-4 border-t-2 border-black">
        <button
          onClick={onEdit}
          className="flex-1 py-3 px-6 bg-white border-2 border-black text-black font-medium hover:bg-black hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
          aria-label="Edit event details"
        >
          Edit Details
        </button>
        <button
          onClick={onExport}
          className="flex-1 py-3 px-6 bg-black text-white font-medium hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
          aria-label="Export to calendar"
        >
          Export to Calendar
        </button>
      </div>
    </div>
  );
}
