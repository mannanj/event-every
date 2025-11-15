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

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export function parseTimezoneFromText(text: string): string | null {
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

export function normalizeTimezone(timezone: string | undefined): string {
  if (!timezone) {
    return getBrowserTimezone();
  }

  const upperTimezone = timezone.toUpperCase();
  if (TIMEZONE_ABBREVIATIONS[upperTimezone]) {
    return TIMEZONE_ABBREVIATIONS[upperTimezone];
  }

  if (isValidIANATimezone(timezone)) {
    return timezone;
  }

  const parsedTz = parseTimezoneFromText(timezone);
  if (parsedTz) {
    return parsedTz;
  }

  return getBrowserTimezone();
}

export function convertToIANATimezone(timezone: string): string {
  const normalized = normalizeTimezone(timezone);
  return normalized;
}
