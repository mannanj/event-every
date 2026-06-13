# Plan 008: Fix ICS date handling — all-day round-trips, TZID, and the silent "now" fallback

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f53bf0e..HEAD -- src/services/icsParser.ts src/services/exporter.ts`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (changes the values written into exported .ics files — the core product output; gated by plans/003's round-trip tests)
- **Depends on**: plans/003 (characterization tests exist and get deliberately updated here)
- **Category**: bug
- **Planned at**: commit `f53bf0e`, 2026-06-10

## Why this matters

Three verified defects in the .ics layer — the product's actual output format:

1. **All-day drift**: `parseICSDate` turns `YYYYMMDD` into `new Date(year, month, day)` — *local* midnight — while the exporter reads all-day dates back with *local* getters. Consistent within one browser, but an imported all-day event's underlying instant differs by the importing browser's UTC offset, so a date exported in one timezone and re-imported in another can land on the wrong calendar day.
2. **TZID ignored**: non-Z datetimes are parsed as browser-local time, discarding any `TZID=` parameter, so `DTSTART;TZID=America/New_York:20260704T190000` imported in Berlin becomes 19:00 *Berlin* time (6–7 hours early).
3. **Silent "now" fallback**: an unparseable date string returns `new Date()` — the import succeeds with today's date and the user only finds out when they miss the event.

## Current state

- `src/services/icsParser.ts` — exports `parseICSFile(file)` (line 15) and `parseICSContent(icsText)` (line 25). The date core:

```ts
// src/services/icsParser.ts:142-173
function parseICSDate(dateString: string): Date {
  // Remove any timezone identifiers for simplicity
  dateString = dateString.replace(/;.*$/, '');

  // Format: YYYYMMDD or YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
  if (dateString.length === 8) {
    const year = parseInt(dateString.substring(0, 4));
    const month = parseInt(dateString.substring(4, 6)) - 1;
    const day = parseInt(dateString.substring(6, 8));
    return new Date(year, month, day);          // ← local midnight
  } else if (dateString.length >= 15) {
    ...
    if (dateString.endsWith('Z')) {
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    } else {
      return new Date(year, month, day, hour, minute, second);  // ← TZID discarded
    }
  }

  // Fallback to current date if parsing fails
  return new Date();                              // ← silent wrong data
}
```

Note: this plan's author read lines 125-181; the property-line splitting (how `DTSTART;TZID=...` reaches this function — full line, value-only, or parameter string) lives **above line 125 and was not read**. Step 1 requires you to read the whole file first; the TZID step has an explicit STOP if parameters never reach parseable scope.

- `src/services/exporter.ts` — uses the `ics` npm package (`createEvent, createEvents` imported at line 1); the date conversion:

```ts
// src/services/exporter.ts:114-130
function dateToArray(date: Date, allDay: boolean = false): [number, number, number, number, number] | [number, number, number] {
  if (allDay) {
    return [
      date.getFullYear(),     // ← local getters for all-day
      date.getMonth() + 1,
      date.getDate(),
    ];
  }
  // Use UTC components — Date objects now represent correct UTC moments
  return [
    date.getUTCFullYear(),    // ← UTC getters for timed events
    ...
  ];
}
```

- `CalendarEvent` (in `src/types/event.ts`) carries `allDay: boolean` and `startDate/endDate: Date` — there is no separate calendar-date type; the chosen convention must be expressible with `Date` + `allDay`.
- plans/003 pinned today's behavior in `src/services/__tests__/icsParser.test.ts` with `// KNOWN QUIRK (plans/008)` tags (local-midnight all-day; "now" fallback).
- Repo error-handling convention: services return result objects / safe fallbacks and `console.warn`/`console.error`, they don't throw to the UI (see `exporter.ts:95-111` returning `{ success: false, error }`).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `bun install`            | exit 0              |
| Typecheck | `bun run type-check`     | exit 0 (verified passing at f53bf0e) |
| Unit tests | `bun run test`          | exit 0 (script exists after plans/003) |
| Build     | `bun run build`          | exit 0 (verified passing at f53bf0e) |
| Targeted e2e | `bunx playwright test e2e/draft-and-history.spec.ts` | all pass (mocked network; exercises history/event flows) |

## Scope

**In scope**:
- `src/services/icsParser.ts`
- `src/services/exporter.ts` (the `dateToArray` all-day branch only)
- `src/services/__tests__/icsParser.test.ts`, `src/services/__tests__/exporter.test.ts` (update quirk pins, add cases)

**Out of scope** (do NOT touch):
- `src/types/event.ts` — no new fields/types; the fix must work within `Date` + `allDay`.
- `src/utils/timeConversion.ts`, `src/utils/timezone.ts` (you may *call* `isValidIANATimezone`/`normalizeTimezone` from the parser, but don't modify them).
- The LLM parsing path (`src/services/parser.ts`) and UI components.
- `exportAll.ts` (it consumes exporter output; no direct date logic).

## Git workflow

- Branch: `advisor/008-ics-date-correctness`
- One commit, e.g. `Plan 008: UTC-anchored all-day dates, TZID-aware import, no silent date fallback`, ending with the repo's `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Read both files fully and establish the convention

Read `src/services/icsParser.ts` and `src/services/exporter.ts` end-to-end. Confirm how DTSTART/DTEND property parameters flow into `parseICSDate` (the `;` strip at line 144 suggests parameters may arrive attached). Then adopt and write down (as a comment at the top of `parseICSDate` and `dateToArray`) the single convention: **all-day dates are represented as UTC midnight** (`Date.UTC(y, m, d)`) **and read back with UTC getters**; the `allDay` flag, not the Date, is what marks them.

**Verify**: you can state, in your report, the exact call chain from a raw `DTSTART;TZID=X:VALUE` line to `parseICSDate`.

### Step 2: All-day — UTC in, UTC out

- Parser: 8-char branch returns `new Date(Date.UTC(year, month, day))`.
- Exporter: the `allDay` branch of `dateToArray` switches to `getUTCFullYear()/getUTCMonth() + 1/getUTCDate()`.
- Update the plans/003 quirk tests: all-day parse now asserts the UTC-midnight instant; add the round-trip test — parse `20260314` → export → the generated ICS contains `20260314` again **regardless of `TZ`** (run the suite once with `TZ=America/New_York bun run test` and once with `TZ=Pacific/Auckland bun run test` to prove timezone-independence; both must pass).

**Verify**: `TZ=America/New_York bun run test` → all pass; `TZ=Pacific/Auckland bun run test` → all pass.

### Step 3: Honor TZID on import

In the parser, when a datetime value (length ≥ 15, no `Z`) carries a `TZID=<zone>` parameter and `isValidIANATimezone(zone)` (from `@/utils/timezone`) is true, compute the UTC instant for that wall time in that zone. Implement a small pure helper inside `icsParser.ts` (do not modify `timeConversion.ts`): construct the candidate via `Date.UTC(...)`, measure the zone's offset at that instant with `Intl.DateTimeFormat(..., { timeZone: zone, timeZoneName: 'longOffset' })` (or the equivalent parts-based technique **already used in `src/utils/timeConversion.ts` — read `convertRawToDate` at line 11 first and reuse its approach**), and adjust. Unknown/invalid TZID → current behavior (browser-local) with a `console.warn`.

**Verify**: new unit test: `DTSTART;TZID=America/New_York:20260704T190000` parses to `2026-07-04T23:00:00.000Z`; same input with `TZID=Asia/Kolkata` → `13:30:00.000Z`. Both pass under both `TZ=` values from Step 2.

### Step 4: Replace the silent fallback

`parseICSDate` returns `Date | null`; on unparseable input, `console.warn('Skipping event with unparseable ICS date:', <the raw string>)` and return `null`. In the VEVENT assembly (around `icsParser.ts:127-139`), a null start date drops that event; a null end date with a valid start falls back to start + 1 hour (match the duration default used elsewhere in the file if one exists — read first). `parseICSContent` keeps returning the successfully-parsed events.

**Verify**: updated unit test: a VCALENDAR with one good and one garbage-dated VEVENT yields exactly 1 event (was 2-with-wrong-date); `grep -n "return new Date();" src/services/icsParser.ts` → no matches.

### Step 5: Full gate

`bun run test` (both TZ variants) → all pass; `bun run type-check`, `bun run build` → exit 0; `bunx playwright test e2e/draft-and-history.spec.ts` → all pass.

## Test plan

- Updated: the two `KNOWN QUIRK (plans/008)` pins flip to correct behavior.
- New: TZ-independent all-day round-trip (Step 2), two TZID conversions incl. a half-hour offset zone (Step 3), good+garbage VEVENT filtering (Step 4), and a `VALUE=DATE`-parameterized DTSTART if Step 1 shows parameters reach the function.
- All tests run offline under both `TZ=America/New_York` and `TZ=Pacific/Auckland`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "return new Date();" src/services/icsParser.ts` → no matches
- [ ] `grep -n "getFullYear" src/services/exporter.ts` → no matches (all-day branch is UTC now)
- [ ] `TZ=America/New_York bun run test` and `TZ=Pacific/Auckland bun run test` both exit 0
- [ ] No test remains tagged `KNOWN QUIRK (plans/008)`
- [ ] `bun run type-check` and `bun run build` exit 0; `bunx playwright test e2e/draft-and-history.spec.ts` passes
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- plans/003's ICS tests don't exist (003 not landed) — this plan depends on them.
- Step 1 reveals that TZID parameters are stripped before any reachable scope (e.g. the line splitter discards parameters entirely and refactoring it would exceed this plan's scope) — then deliver Steps 2 + 4 only and report Step 3 as needing a parser-structure follow-up.
- The `ics` package rejects the UTC all-day arrays or e2e reveals exported all-day events shifting by a day in the UI — report with the failing case.
- You need to add fields to `CalendarEvent`.

## Maintenance notes

- Anything that later renders all-day dates must use UTC getters (or `Intl` with `timeZone: 'UTC'`) — grep UI date rendering for all-day paths in review; `src/app/page.tsx` renders event dates with `Intl.DateTimeFormat` (around lines 934-940) and should be spot-checked with an all-day event after this lands.
- The exporter's timed-event path already assumes "Date objects represent correct UTC moments" (comment at `exporter.ts:122`) — this plan extends the same contract to all-day; keep them aligned in future changes.
- Deferred: full RFC 5545 line-unfolding/parameter parsing (the current hand-rolled parser handles the common cases; if import becomes a headline feature — see the direction findings — consider a proper ical library then).
