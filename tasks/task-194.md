### Task 194: All-day events drift by a day when created and exported in different timezones

**Severity: Medium** · Discovered 2026-06-13 while fixing the timezone-resolution bug (interview email: 10:30 AM → 6:30 AM). This is a SEPARATE latent bug, safe to address in a follow-on session.

#### Symptom
An all-day event created in one timezone can export/display on the wrong calendar day after the
viewer's timezone changes (travel, a different device, or a system-clock zone change). E.g. an
all-day event for "June 15" created in Tokyo can export as "June 14" when later exported from a
UTC / US-Pacific machine.

#### Root cause
All-day events take a different, timezone-naive path from timed events:
- **Creation** — `src/app/page.tsx` `convertParsedToCalendarEvent` all-day branch builds the date
  with `new Date(rawStart + 'T00:00:00')` (browser-LOCAL midnight, an absolute instant that depends
  on the creating zone). Timed events correctly use `convertRawToDate`.
- **Export** — `src/services/exporter.ts` `dateToArray(date, allDay=true)` reads it back with LOCAL
  getters (`getFullYear/getMonth/getDate`, lines 116-120).
- **Persistence** — `src/services/storage.ts` serializes via `JSON.stringify(Date)` (UTC ISO) and
  revives with `new Date(...)` (lines 82-84, 206-208).

Within a single zone, local-create + local-read cancel out and the date is correct. Across a zone
change between create and read, the local getters resolve the stored UTC instant to a different
calendar day → ±1 day shift. The display path (`DATE_FMT`, browser-local) shifts the same way.

#### Fix direction
- [x] Make all-day dates timezone-independent end to end: represent the all-day date as a plain
      Y-M-D (string or `Date.UTC`-based midnight) and read it back with UTC getters consistently in
      `dateToArray`, so the exported/displayed DATE never depends on the viewing zone.
- [x] Keep the `ics` lib `startInputType/startOutputType: 'local'` semantics consistent with the
      chosen representation (a floating `VALUE=DATE` is correct for all-day per RFC 5545).
- [x] Audit the display path (`EventCard` `DATE_FMT`) for the same zone-dependence.

#### Tests (write them, then mutation-prove they fail on the bug)
- [x] Unit: an all-day date round-trips to the same Y-M-D under two different `TZ` values.
- [x] E2E (webkit): create an all-day event with `test.use({ timezoneId })` pinned to two different
      zones; assert the card shows the same date and the exported DTSTART is the same `VALUE=DATE`.

- Location: `src/app/page.tsx` (allDay branch ~156-160), `src/services/exporter.ts` (`dateToArray` 114-130), `src/services/storage.ts`, `src/components/event-card/EventCard.tsx` (`DATE_FMT`)
