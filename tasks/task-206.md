### Task 206: Restore the scan result UI, and give the model the date it needs

**Severity: Blocked launch** · Reported 2026-09-15 from production screenshots: "the result is
completely bugged and useless for someone. it is noise and pure bad."

- [x] Give the Scanner a reference date so an omitted year stops destroying the temporal
- [x] Convert Scanner candidates back into `CalendarEvent` with the app's own defaults
- [x] Render scan results through the original event cards again
- [x] Stop the pending-request screen from replacing the whole input
- [x] Say something when a scan finds nothing
- Location: `src/server/scanner/scanContext.ts`, `src/server/scanner/transport.ts`,
  `src/app/api/scan/route.ts`, `src/services/reviewEvent.ts`, `src/services/scanClient.ts`,
  `src/app/page.tsx`

#### What the reader saw

Four screenshots of one scan of a Google Meet invite. Per event card: a raw UUID in the
heading, then four stacked diagnostic sections - scan issues, candidate issues, export
blockers, export warnings - then an omitted-fields list, in library vocabulary
(`field_not_found`, `incompatible_temporal_kinds`). Every date field empty. Export greyed out.
The blocks sit *between* cards, so each wall of red text reads as belonging to the event named
below it.

A fifth screenshot showed the input replaced by "Restoring your pending request...".

#### Three causes, not one

**1. The model could not legally answer.** `SYSTEM_PROMPT` says "Never invent a year", and
`FloatingPointSchema` / `ZonedPointSchema` both require a complete date. Given "Tuesday,
September 22 - 7:00 - 8:30pm" with no year, the only legal moves are a `partial` point or a
null start, and it took both at random. Production, before the fix:

```
temporal: { start: null, end: null, duration: null, allDay: false }
issues:   temporal - missing_year (blocker)
```

The whole time was gone, not just the year. `missing_year` is a **blocker**, so nothing
exported - which made every result useless regardless of how it was drawn.

**2. The normalization layer was deleted.** `convertParsedToEvent` resolved the timezone
against the browser, defaulted end to start + 1h, and guarded NaN. It went with `/api/parse`
in `195e9b4`. The Scanner is a library and correctly answers only what the source said; the
app stopped supplying the rest.

**3. The UI was replaced wholesale.** `5bb24f7` rewrote `page.tsx` (811 changed, 629 deleted)
and pointed results at a new `src/components/review/`, written directly against the library's
shapes. The original cards were never deleted - `UnsavedEventsSection` stayed mounted the
whole time, fed an array nothing populated.

#### The fix

`scanContext.ts` supplies today's date and the reader's zone as a second system message,
inserted between the extraction contract and the source. Resolving a year against a supplied
reference is derivation, not invention, which is the only thing the prompt actually forbids.
The weekday rule carries most of the weight: a source naming a weekday pins the year by
itself, since a given month/day recurs on a given weekday about once every six years.

Measured on the reported sample against the real model, same request otherwise:

| | before | after |
| --- | --- | --- |
| start | `null` | `2026-09-22T19:00 America/New_York`, `resolution: exact` |
| end | `null` | `2026-09-22T20:30 America/New_York` |
| url | `null` | `https://meet.google.com/odi-xddv-kez` |
| blockers | `missing_year` | none |

2026 is the only nearby year in which September 22 is a Tuesday, so the source's own weekday
confirms the answer rather than the model asserting it.

`reviewEvent.ts` restores the app-side layer against the Scanner's shapes: source zone before
reader zone, end defaulting to an hour, all-day inferred from a point that carries no time,
`rawStartDate`/`rawTimezone` preserved so the card can re-derive the instant when the reader
changes the zone. A partial point missing its year falls back rather than being guessed into
year 0022.

The zone travels as `X-Event-Every-Time-Zone` rather than in the body, whose canonical JSON is
bound into the provider request hash; Cloudflare's `cf.timezone` is the fallback.

#### Verified in production

Input visible on load, card list rendered, no library vocabulary on screen, no recovery banner
during a normal scan. The card reads "Civic Signal - Sep 22 at 7:00 PM ET".

#### Still open

- [ ] **`e2e/scanner-product-loop.spec.ts` (1359 lines) and `e2e/private-provider-state.spec.ts`
  (309 lines) drive the removed review UI** and the `event-every:review-drafts:v1` key. They
  assert real invariants - privacy of persisted state, provider-operation correctness - against
  a surface that no longer exists, so they need rewriting against the card UI rather than
  deleting. Not attempted here.
- [ ] `src/services/scannerExporter.ts` (199 lines) and `src/services/reviewStorage.ts` are now
  unreachable from the app; export runs through `exportMultipleToICS` again. Keep or retire
  deliberately.
- [ ] Negative inputs still return a null-filled placeholder (task 205). The scan context now
  ends with "Never emit a candidate for the current date alone", which guards the new failure
  mode this change could have introduced, but does not address the original one.
