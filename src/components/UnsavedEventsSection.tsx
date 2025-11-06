'use client';

import { CalendarEvent } from '@/types/event';
import BatchEventList from './BatchEventList';

interface UnsavedEventsSectionProps {
  events: CalendarEvent[];
  onEdit: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
  onExport: (event: CalendarEvent) => void;
  onCancelAll: () => void;
  onExportComplete: (events: CalendarEvent[]) => void;
}

export default function UnsavedEventsSection({
  events,
  onEdit,
  onDelete,
  onExport,
  onCancelAll,
  onExportComplete,
}: UnsavedEventsSectionProps) {
  if (events.length === 0) {
    return null;
  }

  return (
    <div className="mb-12">
      <div className="border-2 border-black bg-white shadow-md">
        <div className="p-4 border-b-2 border-black bg-white">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-black">Unsaved Events</h2>
            <span className="px-3 py-1 bg-black text-white text-sm font-bold rounded-full">
              {events.length}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1">Review and save your events</p>
        </div>
        <BatchEventList
          events={events}
          isProcessing={false}
          source={events[0]?.source || 'text'}
          onEdit={onEdit}
          onDelete={onDelete}
          onExport={onExport}
          onCancel={onCancelAll}
          onExportComplete={onExportComplete}
          showHeader={false}
        />
      </div>
    </div>
  );
}
