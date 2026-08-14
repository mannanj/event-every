'use client';

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

export default function OwnerBudgetScreen({
  state,
  resetAt,
  onViewEvents,
}: {
  state: OwnerBudgetScreenState;
  resetAt: string | null;
  onViewEvents: () => void;
}) {
  const resetLabel = formatResetAt(resetAt);
  const message = resetLabel === null
    ? UNKNOWN_RESET_MESSAGE
    : `Event Every is powered by community support. New event processing is paused until ${resetLabel}, but your saved events are still available.`;
  return (
    <main
      className="min-h-screen rainbow-gradient-bg flex items-center justify-center px-6 py-12"
      data-testid="owner-budget-screen"
      data-owner-budget-state={state}
    >
      <div className="bg-white border-2 border-black p-8 max-w-xl w-full">
        <h1 className="text-3xl font-black retro-rainbow-text tracking-wider text-center mb-8">Event Every</h1>
        <h2 className="text-xl font-black text-black mb-4">Event processing is paused</h2>
        <p className="text-black text-base leading-relaxed" data-testid="owner-budget-message">
          {message}
        </p>
        <button
          type="button"
          onClick={onViewEvents}
          className="mt-6 w-full border-2 border-black bg-black px-4 py-3 font-semibold text-white transition-colors hover:bg-white hover:text-black focus:outline-none focus:ring-2 focus:ring-black"
        >
          View my events
        </button>
      </div>
    </main>
  );
}
