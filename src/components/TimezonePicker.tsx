'use client';

import { getTimezoneAbbreviation } from '@/utils/timeConversion';
import { getBrowserTimezone } from '@/utils/timezone';

// The single canonical list of selectable timezones. The event editor (EventFields, via
// TimezonePicker) and the batch event card header both read this; the card header was
// migrated onto this component in plan 015, removing its former duplicate copy of the list.
export const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Europe/Athens', label: 'Athens' },
  { value: 'Asia/Kolkata', label: 'India' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Seoul', label: 'Seoul' },
  { value: 'Asia/Shanghai', label: 'China' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Pacific/Auckland', label: 'Auckland' },
];

/**
 * Friendly display label for an IANA zone: the curated label when it's one of COMMON_TIMEZONES
 * (e.g. 'America/New_York' → 'Eastern Time'), else the raw zone with underscores spaced out.
 * Lives here so the COMMON_TIMEZONES list stays the single source of truth.
 */
export function friendlyTimezoneLabel(timezone: string): string {
  return COMMON_TIMEZONES.find(tz => tz.value === timezone)?.label || timezone.replace('_', ' ');
}

interface TimezonePickerProps {
  // The date the abbreviation is computed for (DST-correct).
  date: Date;
  // The selected IANA timezone (falls back to the browser zone when undefined).
  value?: string;
  onChange: (timezone: string) => void;
}

/**
 * The dotted-underline timezone affordance: shows the current zone's abbreviation with a
 * caret, backed by a transparent full-bleed <select>. Visually identical to the cluster
 * that used to be inlined in the event editor and the batch card header.
 */
export default function TimezonePicker({ date, value, onChange }: TimezonePickerProps) {
  const tzAbbr = getTimezoneAbbreviation(date, getBrowserTimezone());

  return (
    <span className="group relative inline-block ml-0.5 border-0 border-b border-dotted border-gray-400 hover:border-black cursor-pointer">
      <span data-testid="tz-chip" className="text-gray-500 text-sm pointer-events-none">
        {tzAbbr}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 4" className="inline-block w-1.5 h-1 ml-0.5 mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor"><path d="M0 0l3 4 3-4z"/></svg>
      </span>
      <select
        value={value || getBrowserTimezone()}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full opacity-0 cursor-pointer"
        aria-label="Timezone"
      >
        {COMMON_TIMEZONES.map(tz => (
          <option key={tz.value} value={tz.value}>
            {(() => {
              const abbr = getTimezoneAbbreviation(date, tz.value);
              return abbr === tz.label ? tz.label : `${tz.label} (${abbr})`;
            })()}
          </option>
        ))}
      </select>
    </span>
  );
}
