import { normalizeTimezone, getBrowserTimezone, isValidIANATimezone } from '@/utils/timezone';
import { TimezoneStatus, TimezoneSource } from '@/types/event';

export interface TimezoneResolution {
  timezone: string;
  status: TimezoneStatus;
  source: TimezoneSource | 'unknown';
}

export function resolveTimezone(
  rawTimezone: string | undefined,
  browserTimezone?: string
): TimezoneResolution {
  const browserTZ = browserTimezone || getBrowserTimezone();

  if (!rawTimezone) {
    return { timezone: browserTZ, status: 'unknown', source: 'unknown' };
  }

  const normalized = normalizeTimezone(rawTimezone);

  // normalizeTimezone falls back to browser TZ if it can't resolve —
  // check if it actually resolved to something different or matched a known pattern
  if (normalized !== browserTZ || isKnownTimezone(rawTimezone)) {
    return { timezone: normalized, status: 'resolved', source: 'programmatic' };
  }

  return { timezone: browserTZ, status: 'unknown', source: 'unknown' };
}

function isKnownTimezone(raw: string): boolean {
  const upper = raw.toUpperCase().trim();
  const knownAbbreviations = [
    'PST', 'PDT', 'MST', 'MDT', 'CST', 'CDT', 'EST', 'EDT',
    'AST', 'ADT', 'HST', 'AKST', 'AKDT', 'GMT', 'UTC', 'BST',
    'CET', 'CEST', 'EET', 'EEST', 'IST', 'JST', 'KST',
    'AEST', 'AEDT', 'AWST', 'ACST', 'ACDT', 'NZST', 'NZDT',
  ];
  if (knownAbbreviations.includes(upper)) return true;
  if (/^UTC[+-]\d{1,2}/.test(upper) || /^GMT[+-]\d{1,2}/.test(upper)) return true;
  if (isValidIANATimezone(raw)) return true;
  return false;
}
