### Task 209: Bring the browser suite back to the card UI and the renamed button

44 of 60 Chromium tests failed on 2026-09-15. Two unrelated breakages: the landing rework
renamed the submit button (`138e216`, "Transform content to events" to "Pop it"), and the
scan-result review UI was deleted in `f72a4e5` while eight spec files still drove it. The
button is now "Scan" (label `Scan - turn your input into events`), reachable through one
helper so the next rename is one line.

- [x] Shared helpers: `scanButton`, `waitForCards`, `cardTitled`, `readTempUnsaved`, `downloadedCalendar`, `setCardTime`, `setCardDate`
- [x] `recent-input`, `community-limit`, `calendar-event-regression`, `event-extraction`, `url-scrape`: ported
- [x] `timezone-resolution`: ported to the card semantics (viewer-zone display, source zone on the picker, UTC instants in the export)
- [x] `scanner-product-loop`: rewritten test by test against the cards
- [x] Card fix found by the port: an edited time kept the seconds of a fallback start and exported them
- Location: `e2e/helpers.ts`, `e2e/*.spec.ts`, `src/components/event-card/EventCard.tsx`

#### What the port preserved, and what it could not

Every privacy and provider-state invariant kept its test: no image bytes or raw submission in
storage, strict data URL on the wire, images scanned strictly in order, cancel prevents the
second request, the stale-result guard after a cancel, the all-day date surviving Tokyo and
Los Angeles viewers, export of exactly the selected subset, malformed responses producing an
error and no card, finding nothing said once.

Three review-only behaviours have no card equivalent and their tests were rewritten to what
the cards actually do, not deleted silently:

| review UI asserted | cards do | test now asserts |
| --- | --- | --- |
| missing start blocks export until edited | the card is placed at its creation time and is editable | editing date and time on the card exports the edited start |
| missing title exports without SUMMARY | the card is "Untitled Event" | exports `SUMMARY:Untitled Event` |
| a zoned point exports `DTSTART;TZID=...`, a floating one a bare local time | the exporter writes UTC instants | the instant is right for both, and the card keeps the source zone on its picker |

One test was retired outright: the DST-fold case, which asserted that an evidence-free edit
into an ambiguous local time is blocked until the zone is cleared. That readiness machinery
was the review UI's; the cards have no equivalent and inventing one is a product decision.

Partial export changed meaning too: saving a subset now discards the unselected cards (the
UI says "n events will be lost"), so the retained-draft-after-reload test became a
reload-restores-unsaved-cards test plus a save-discards-the-rest test.

`private-provider-state.spec.ts` and `c1-a-runtime-admission.spec.ts` are excluded from the
local run by the config and still reference the review UI. Not touched.
