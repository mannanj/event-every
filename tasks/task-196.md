### Task 196: ICS import ignores TZID and parses zoned times as browser-local

**Severity: Medium** · Discovered 2026-06-13 during the timezone-resolution bugfix. Already noted as a
KNOWN QUIRK in `src/services/__tests__/icsParser.test.ts` (refers to `plans/008`). Follow-on session.

#### Symptom
Importing an `.ics` whose datetime carries a TZID — e.g.
`DTSTART;TZID=America/New_York:20260615T103000` — yields the wrong instant for any viewer not in that
zone (the time is read as the viewer's local wall time instead of Eastern).

#### Root cause
`src/services/icsParser.ts` `parseICSDate` (142-173):
- line 144 strips the parameter: `dateString = dateString.replace(/;.*$/, '')` — discarding `TZID`.
- lines 165-167 parse a non-`Z` datetime with `new Date(y, m, d, h, m, s)` — browser-LOCAL.

So the stated source zone is dropped and the wall time is reinterpreted in the importer's zone. This
is the import-side mirror of the parse-side bug just fixed (unknown zone → silent local/UTC default).

#### Fix direction
- [ ] Capture the `TZID` parameter instead of stripping it; when present, convert the wall time with
      the existing authority `convertRawToDate(rawISO, tzid)` (REUSE it — do not add a parallel
      converter). Fall back to the browser zone only when there is no `TZID` and no trailing `Z`.
- [ ] Normalize common non-IANA TZID labels via `resolveTimezoneZone` (the same authority the parser
      bugfix now uses), so `TZID=Eastern Time` etc. resolve rather than silently localizing.
- [ ] Flip the KNOWN QUIRK assertion in `icsParser.test.ts` in lockstep, and add a case asserting a
      `TZID=America/New_York` time imports to the correct UTC instant regardless of the runner's zone.

- Location: `src/services/icsParser.ts` (`parseICSDate` 142-173), `src/services/__tests__/icsParser.test.ts`, cross-ref `plans/008`
