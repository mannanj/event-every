'use client';

export type OwnerBudgetScreenState = 'exhausted' | 'frozen' | 'unavailable';

const CONTENT: Readonly<Record<OwnerBudgetScreenState, Readonly<{ title: string; message: string }>>> = {
  exhausted: {
    title: 'Owner budget reached',
    message: 'Event processing is paused until the daily owner budget resets.',
  },
  frozen: {
    title: 'Owner budget frozen',
    message: 'Event processing is paused while the owner accounting state is checked.',
  },
  unavailable: {
    title: 'Owner budget unavailable',
    message: 'Event processing is temporarily unavailable. Please try again later.',
  },
};

export default function OwnerBudgetScreen({
  state,
  onViewEvents,
}: {
  state: OwnerBudgetScreenState;
  onViewEvents: () => void;
}) {
  const content = CONTENT[state];
  return (
    <main
      className="min-h-screen rainbow-gradient-bg flex items-center justify-center px-6 py-12"
      data-testid="owner-budget-screen"
      data-owner-budget-state={state}
    >
      <div className="bg-white border-2 border-black p-8 max-w-xl w-full">
        <h1 className="text-3xl font-black retro-rainbow-text tracking-wider text-center mb-8">Event Every</h1>
        <h2 className="text-xl font-black text-black mb-4">{content.title}</h2>
        <p className="text-black text-base leading-relaxed" data-testid="owner-budget-message">
          {content.message}
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
