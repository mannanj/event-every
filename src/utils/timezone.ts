import { TimezoneStatus, TimezoneSource } from '@/types/event';

const TIMEZONE_ABBREVIATIONS: Record<string, string> = {
  'PST': 'America/Los_Angeles',
  'PDT': 'America/Los_Angeles',
  'MST': 'America/Denver',
  'MDT': 'America/Denver',
  'CST': 'America/Chicago',
  'CDT': 'America/Chicago',
  'EST': 'America/New_York',
  'EDT': 'America/New_York',
  'AST': 'America/Halifax',
  'ADT': 'America/Halifax',
  'HST': 'Pacific/Honolulu',
  'AKST': 'America/Anchorage',
  'AKDT': 'America/Anchorage',
  'GMT': 'Europe/London',
  'UTC': 'UTC',
  'BST': 'Europe/London',
  'CET': 'Europe/Paris',
  'CEST': 'Europe/Paris',
  'EET': 'Europe/Athens',
  'EEST': 'Europe/Athens',
  'IST': 'Asia/Kolkata',
  'JST': 'Asia/Tokyo',
  'KST': 'Asia/Seoul',
  'AEST': 'Australia/Sydney',
  'AEDT': 'Australia/Sydney',
  'AWST': 'Australia/Perth',
  'ACST': 'Australia/Adelaide',
  'ACDT': 'Australia/Adelaide',
  'NZST': 'Pacific/Auckland',
  'NZDT': 'Pacific/Auckland',
};

const KNOWN_ABBREVIATIONS = new Set(Object.keys(TIMEZONE_ABBREVIATIONS));

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

function parseTimezoneFromText(text: string): string | null {
  const upperText = text.toUpperCase();

  for (const [abbr, iana] of Object.entries(TIMEZONE_ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'i');
    if (regex.test(text)) {
      return iana;
    }
  }

  const utcOffsetMatch = text.match(/UTC([+-]\d{1,2}):?(\d{2})?|GMT([+-]\d{1,2}):?(\d{2})?/i);
  if (utcOffsetMatch) {
    const hours = utcOffsetMatch[1] || utcOffsetMatch[3];
    const minutes = utcOffsetMatch[2] || utcOffsetMatch[4] || '00';
    return `Etc/GMT${hours > '0' ? '-' : '+'}${Math.abs(parseInt(hours))}`;
  }

  const ianaMatch = text.match(/\b([A-Z][a-z]+\/[A-Z][a-z_]+)\b/);
  if (ianaMatch && isValidIANATimezone(ianaMatch[1])) {
    return ianaMatch[1];
  }

  return null;
}

export function isValidIANATimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export interface ResolvedTimezone {
  timezone: string;   // always a valid IANA zone (falls back to browser zone)
  resolved: boolean;  // true iff `raw` was understood; false iff we fell back blindly
}

export function resolveTimezoneZone(raw: string | undefined): ResolvedTimezone {
  if (!raw) return { timezone: getBrowserTimezone(), resolved: false };

  const upper = raw.toUpperCase().trim();
  if (KNOWN_ABBREVIATIONS.has(upper)) {
    return { timezone: TIMEZONE_ABBREVIATIONS[upper], resolved: true };
  }
  if (isValidIANATimezone(raw)) {
    return { timezone: raw, resolved: true };
  }
  const parsed = parseTimezoneFromText(raw);
  if (parsed) return { timezone: parsed, resolved: true };

  return { timezone: getBrowserTimezone(), resolved: false };
}

export function normalizeTimezone(timezone: string | undefined): string {
  return resolveTimezoneZone(timezone).timezone;
}

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
  const { timezone, resolved } = resolveTimezoneZone(rawTimezone);
  if (resolved) {
    return { timezone, status: 'resolved', source: 'programmatic' };
  }
  return { timezone: browserTZ, status: 'unknown', source: 'unknown' };
}
