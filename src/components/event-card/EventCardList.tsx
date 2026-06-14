'use client';

import { CalendarEvent } from '@/types/event';
import { exportMultipleToICS } from '@/services/exporter';
import { EventSelection } from '@/hooks/useEventSelection';
import EventCard from './EventCard';

interface EventCardListProps {
  events: CalendarEvent[];
  selection: EventSelection;
  isProcessing: boolean;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
  onExport: (event: CalendarEvent) => void;
  onCancel: () => void;
  onExportComplete: (events: CalendarEvent[]) => void;
  tzSuggestions?: Record<string, { timezone: string; confidence: number }>;
  onTzSuggestionApply?: (eventId: string, timezone: string) => void;
  onTzSuggestionDismiss?: (eventId: string) => void;
  onTimezoneUserChange?: (eventId: string) => void;
}

/**
 * The scrollable list of unsaved event cards plus the save/discard footer.
 * Selection is owned by the page (via useEventSelection) and threaded in as
 * `selection`; this component never owns it. Per-card expand stays card-local.
 *
 * Handlers passed to each memoized <EventCard> are stable (selection.toggle and
 * the page's onEdit are referentially stable), so a message-rotation re-render of
 * an ancestor no longer re-renders every card.
 */
export default function EventCardList({
  events,
  selection,
  isProcessing,
  onEdit,
  onExportComplete,
  onCancel,
  tzSuggestions,
  onTzSuggestionApply,
  onTzSuggestionDismiss,
  onTimezoneUserChange,
}: EventCardListProps) {
  const { selectedIds, selectedCount, toggle, toggleAll } = selection;

  const handleExport = () => {
    if (selectedCount === 0) {
      onCancel();
      return;
    }

    const selectedEvents = events.filter((event) => selectedIds.has(event.id));
    const result = exportMultipleToICS(selectedEvents);

    if (result.success) {
      onExportComplete(selectedEvents);
    } else {
      alert(`Export failed: ${result.error}`);
    }
  };

  const moreThanHalfSelected = selectedCount > events.length / 2;
  const selectAllLabel = moreThanHalfSelected ? 'Unselect all' : 'Select all';

  return (
    <>
      {/* Event list */}
      <div className="max-h-[80vh] overflow-y-auto">
        {events.map((event, index) => (
          <EventCard
            key={event.id}
            event={event}
            selected={selectedIds.has(event.id)}
            isNew={index === events.length - 1 && isProcessing}
            onToggleSelect={toggle}
            onEdit={onEdit}
            tzSuggestion={tzSuggestions?.[event.id]}
            onTzSuggestionApply={onTzSuggestionApply}
            onTzSuggestionDismiss={onTzSuggestionDismiss}
            onTimezoneUserChange={onTimezoneUserChange}
          />
        ))}
      </div>

      {/* Save/Delete button */}
      {events.length > 0 && !isProcessing && (
        <div className="px-4 pt-4 pb-1 border-t-2 border-black">
          <button
            onClick={handleExport}
            data-testid="save-events-button"
            className={`w-full py-3 px-6 border-2 transition-colors focus:outline-none focus:ring-2 ${
              selectedCount === 0
                ? 'bg-red-500 text-white border-red-500 hover:bg-red-600 hover:border-red-600 focus:ring-red-500'
                : 'bg-black text-white border-black hover:bg-white hover:text-black focus:ring-black'
            }`}
            aria-label={selectedCount === 0 ? 'Discard all events' : `Save ${selectedCount} event${selectedCount !== 1 ? 's' : ''}`}
          >
            {selectedCount === 0 ? 'Discard all' : `Save (${selectedCount})`}
          </button>
          <div className="text-xs text-center mt-1">
            <p className="text-black">
              Pick what you want to keep •{' '}
              <button
                onClick={toggleAll}
                className="underline hover:no-underline focus:outline-none"
                aria-label={selectAllLabel}
              >
                {selectAllLabel}
              </button>
              {selectedCount < events.length && (
                <>
                  {' '}•{' '}
                  <span className="text-red-400">
                    {events.length - selectedCount} event{events.length - selectedCount !== 1 ? 's' : ''} will be lost
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
