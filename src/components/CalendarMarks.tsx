/**
 * The calendars an exported .ics lands in.
 *
 * Marks rather than a list of names, because the point is recognition at a
 * glance - and recognition here comes from colour and silhouette, not detail.
 * These are simplified in each product's own palette: a black-and-white version
 * reads as three identical grey squares, which is worse than no marks at all.
 *
 * Drawn rather than fetched. The real logos are trademarks, and pulling three
 * brand assets onto the landing page to say "this file is a standard format"
 * would be both a licensing question and three more requests on first paint.
 */

const SIZE = 22;

export function AppleCalendarMark() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" role="img" aria-label="Apple Calendar">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="#fff" stroke="#d9d9de" strokeWidth="1" />
      {/* The red day strip and a numeral: what the eye actually keys on. */}
      <path d="M1.5 6.5A5 5 0 0 1 6.5 1.5h11a5 5 0 0 1 5 5v.5h-21z" fill="#ff3b30" />
      <text
        x="12"
        y="17.6"
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fill="#1c1c1e"
        fontFamily="-apple-system, BlinkMacSystemFont, system-ui, sans-serif"
      >
        31
      </text>
    </svg>
  );
}

export function GoogleCalendarMark() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" role="img" aria-label="Google Calendar">
      <rect x="2.5" y="2.5" width="19" height="19" rx="2" fill="#fff" stroke="#dadce0" strokeWidth="1" />
      {/* Four edges in the four Google colours - the frame is the recognisable
          part once the icon is this small. */}
      <path d="M2.5 4.5A2 2 0 0 1 4.5 2.5h8v2h-10z" fill="#4285f4" />
      <path d="M21.5 4.5A2 2 0 0 0 19.5 2.5h-7v2h9z" fill="#ea4335" />
      <path d="M2.5 19.5A2 2 0 0 0 4.5 21.5h8v-2h-10z" fill="#34a853" />
      <path d="M21.5 19.5a2 2 0 0 1-2 2h-7v-2h9z" fill="#fbbc04" />
      <text
        x="12"
        y="16.2"
        textAnchor="middle"
        fontSize="9.5"
        fontWeight="700"
        fill="#4285f4"
        fontFamily="-apple-system, BlinkMacSystemFont, system-ui, sans-serif"
      >
        31
      </text>
    </svg>
  );
}

export function OutlookCalendarMark() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" role="img" aria-label="Outlook Calendar">
      <rect x="9" y="3.5" width="12" height="17" rx="1.5" fill="#fff" stroke="#c7d3e3" strokeWidth="1" />
      <rect x="9" y="3.5" width="12" height="4" rx="1.5" fill="#0f6cbd" />
      <path d="M12 11h6M12 14h6M12 17h4" stroke="#8aa4c2" strokeWidth="1.3" strokeLinecap="round" />
      {/* The blue panel with a white O is the half everyone recognises. */}
      <rect x="2" y="5.5" width="11" height="13" rx="2" fill="#0f6cbd" />
      <ellipse cx="7.5" cy="12" rx="2.4" ry="3.1" fill="none" stroke="#fff" strokeWidth="1.7" />
    </svg>
  );
}
