'use client';

import { useEffect, useState } from 'react';

import SiteHeader from '@/components/SiteHeader';
import { eventStorage } from '@/services/storage';

export type OwnerBudgetScreenState = 'exhausted' | 'frozen' | 'unavailable';

const UNKNOWN_RESET_MESSAGE = 'Event Every is powered by community support. New event processing is temporarily paused, but your saved events are still available.';

function formatResetAt(resetAt: string | null): string | null {
  if (resetAt === null) return null;
  const resetDate = new Date(resetAt);
  if (Number.isNaN(resetDate.getTime())) return null;
  const date = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
  }).format(resetDate);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(resetDate).replace(/\s/g, '').toLowerCase();
  return `${date} ${time}`;
}

/**
 * What a guest sees while processing is paused.
 *
 * Guests only: someone signed in is sent straight to their own page, where the
 * input is disabled instead. See OwnerBudgetBoundary.
 */
export default function OwnerBudgetScreen({
  state,
  resetAt,
  onViewEvents,
}: {
  state: OwnerBudgetScreenState;
  resetAt: string | null;
  onViewEvents: () => void;
}) {
  // "View my events" is only an offer worth making to someone who has some.
  // Read after mount, because localStorage does not exist during the server
  // render and guessing wrong here shows a button that leads to an empty page.
  const [hasEvents, setHasEvents] = useState(false);
  useEffect(() => {
    setHasEvents((eventStorage.getAllEvents().data?.length ?? 0) > 0);
  }, []);

  const resetLabel = formatResetAt(resetAt);
  const message = resetLabel === null
    ? UNKNOWN_RESET_MESSAGE
    : `Event Every is powered by community support. New event processing is paused until ${resetLabel}${hasEvents ? ', but your saved events are still available' : ''}.`;

  return (
    <main
      className="min-h-screen rainbow-gradient-bg flex flex-col"
      data-testid="owner-budget-screen"
      data-owner-budget-state={state}
    >
      <SiteHeader />

      <div className="flex-1 w-full max-w-md mx-auto px-6 pt-16 pb-12">
        <header className="mb-8">
          <h1 className="display text-[clamp(2rem,6vw,2.75rem)] leading-[1.08] text-black">
            Event processing is paused.
          </h1>
          <p className="mt-4 text-lg text-gray-600 leading-snug" data-testid="owner-budget-message">
            {message}
          </p>
        </header>

        {hasEvents && (
          <button
            type="button"
            onClick={onViewEvents}
            className="block w-full border-2 border-black bg-black px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-white hover:text-black"
            data-testid="owner-budget-view-events"
          >
            View my events
          </button>
        )}
      </div>
    </main>
  );
}
