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
  // Numeric UTC/GMT offsets are matched FIRST: "GMT-04:00" must resolve to Etc/GMT+4 (UTC-4),
  // not short-circuit on the bare \bGMT\b / \bUTC\b entries in the abbreviation map below (which
  // would return Europe/London / UTC and discard the offset). The offset branch was previously
  // unreachable for exactly this reason.
  const utcOffsetMatch = text.match(/(?:UTC|GMT)\s*([+-]\d{1,2})(?::?\d{2})?/i);
  if (utcOffsetMatch) {
    const offset = parseInt(utcOffsetMatch[1], 10);
    if (offset === 0) return 'UTC';
    // POSIX sign inversion: a UTC-4 wall offset is the IANA zone Etc/GMT+4.
    const zone = `Etc/GMT${offset < 0 ? '+' : '-'}${Math.abs(offset)}`;
    if (isValidIANATimezone(zone)) return zone;
  }

  for (const [abbr, iana] of Object.entries(TIMEZONE_ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'i');
    if (regex.test(text)) {
      return iana;
    }
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

/**
 * Sanitize an LLM-proposed timezone before it is applied to an event. The model is asked for an
 * IANA id but sometimes returns a label ("Eastern Time"), an abbreviation ("EDT"), or an offset
 * ("GMT-4"). Returns a guaranteed-valid IANA zone with the model's confidence, or confidence 0
 * when the string cannot be mapped to a real zone. The client treats confidence ≤ 0.8 as "keep
 * the current value", so a zero here means "do not touch the already-correct fallback" instead
 * of stamping the wall-clock time as UTC (the 10:30 ET → 6:30 ET corruption).
 */
export function sanitizeResolvedTimezone(
  rawTimezone: unknown,
  confidence: unknown
): { timezone: string; confidence: number } {
  const conf = typeof confidence === 'number' ? confidence : 0.5;
  if (typeof rawTimezone === 'string' && rawTimezone.trim()) {
    if (isValidIANATimezone(rawTimezone)) {
      return { timezone: rawTimezone, confidence: conf };
    }
    const { timezone, resolved } = resolveTimezoneZone(rawTimezone);
    if (resolved) {
      return { timezone, confidence: conf };
    }
  }
  return { timezone: 'UTC', confidence: 0 };
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
