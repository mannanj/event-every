'use client';

import { CalendarEvent } from '@/types/event';
import { ImageProcessingStatus, URLProcessingStatus } from '@/types/processing';
import { EventSelection } from '@/hooks/useEventSelection';
import ProcessingShimmer from './ProcessingShimmer';
import EventCardList from './event-card/EventCardList';

interface UnsavedEventsSectionProps {
  events: CalendarEvent[];
  selection: EventSelection;
  imageProcessingStatuses: ImageProcessingStatus[];
  urlProcessingStatus: URLProcessingStatus | null;
  isProcessing: boolean;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
  onExport: (event: CalendarEvent) => void;
  onCancelAll: () => void;
  onExportComplete: (events: CalendarEvent[]) => void;
  tzSuggestions?: Record<string, { timezone: string; confidence: number }>;
  onTzSuggestionApply?: (eventId: string, timezone: string) => void;
  onTzSuggestionDismiss?: (eventId: string) => void;
  onTimezoneUserChange?: (eventId: string) => void;
}

export default function UnsavedEventsSection({
  events,
  selection,
  imageProcessingStatuses,
  urlProcessingStatus,
  isProcessing,
  onEdit,
  onDelete,
  onExport,
  onCancelAll,
  onExportComplete,
  tzSuggestions,
  onTzSuggestionApply,
  onTzSuggestionDismiss,
  onTimezoneUserChange,
}: UnsavedEventsSectionProps) {
  const activeProcessingItems = imageProcessingStatuses.filter(
    status => status.status === 'pending' || status.status === 'processing'
  );
  const hasActiveProcessing = activeProcessingItems.length > 0 ||
    (urlProcessingStatus !== null && urlProcessingStatus.phase !== 'complete') ||
    isProcessing;

  if (events.length === 0 && !hasActiveProcessing) {
    return null;
  }

  const processingCount = Math.min(
    activeProcessingItems.length + (urlProcessingStatus && urlProcessingStatus.phase !== 'complete' ? 1 : 0) || 1,
    3
  );

  return (
    <div className="mb-12">
      <div className="border-2 border-black bg-white">
        {/* Processing status label and skeleton loaders */}
        {hasActiveProcessing && (
          <ProcessingShimmer skeletonCount={processingCount} onCancel={onCancelAll} />
        )}

        {/* Unsaved events list */}
        {events.length > 0 && (
          <EventCardList
            events={events}
            selection={selection}
            isProcessing={isProcessing}
            onEdit={onEdit}
            onDelete={onDelete}
            onExport={onExport}
            onCancel={onCancelAll}
            onExportComplete={onExportComplete}
            tzSuggestions={tzSuggestions}
            onTzSuggestionApply={onTzSuggestionApply}
            onTzSuggestionDismiss={onTzSuggestionDismiss}
            onTimezoneUserChange={onTimezoneUserChange}
          />
        )}
      </div>
    </div>
  );
}
