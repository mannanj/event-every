import { getBrowserTimezone } from './timezone';
import type { ClientContext } from '@/types/event';

export function getClientContext(): ClientContext {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - offset * 60 * 1000);

  return {
    currentDateTime: localDate.toISOString().slice(0, -1),
    timezone: getBrowserTimezone(),
    timezoneOffset: -offset,
    locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
  };
}
