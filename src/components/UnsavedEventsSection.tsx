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
      <div className="border-2 border-black bg-white">
        <BatchEventList
          events={events}
          isProcessing={false}
          source={events[0]?.source || 'text'}
          onEdit={onEdit}
          onDelete={onDelete}
          onExport={onExport}
          onCancel={onCancelAll}
          onExportComplete={onExportComplete}
        />
      </div>
    </div>
  );
}
