import { getBrowserTimezone } from './timezone';
import type { ClientContext } from '@/types/event';

export function getClientContext(): ClientContext {
  return {
    currentDateTime: new Date().toISOString(),
    timezone: getBrowserTimezone(),
    timezoneOffset: new Date().getTimezoneOffset(),
    locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
  };
}
