import { useState, useEffect } from 'react';

/**
 * Cycles through `messages` on a randomized 6–9s timer, returning the current one.
 *
 * Intentionally re-renders only its caller's subtree: hosting this inside
 * <ProcessingShimmer> (rather than a parent) keeps the timer from re-rendering the
 * sibling event-card list every few seconds. When the shimmer unmounts the timer
 * stops; the card list never subscribes to it.
 */
export function useRotatingMessage(messages: string[]): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const getRandomInterval = () => Math.floor(Math.random() * 3000) + 6000;

    const scheduleNext = () => {
      const timeout = setTimeout(() => {
        setIndex((prev) => (prev + 1) % messages.length);
        scheduleNext();
      }, getRandomInterval());

      return timeout;
    };

    const timeout = scheduleNext();
    return () => clearTimeout(timeout);
    // messages is a module-level constant from the caller; length is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  return messages[index];
}
