### Task 195: Inline card edits use local setters and go stale against the event timezone

**Severity: Medium** · Discovered 2026-06-13 during the timezone-resolution bugfix. Follow-on session.

#### Symptoms
1. **A manual time edit is silently reverted by a later timezone change.** Edit a card's start time,
   then change the timezone in the picker → the edited time snaps back to the originally-parsed time.
2. **Start can be placed after end.** Editing the start date past the end date produces start > end,
   caught only later at export validation (`exporter.ts:172`), not at edit time.
3. **No end-time editor in the collapsed card.** Only start date/time/title/location are inline-
   editable on the card; editing the end requires expanding to `EventFields`.

#### Root cause
`src/components/event-card/EventCard.tsx` `handleFieldEdit` (lines 88-106) edits via
`new Date(event.startDate).setFullYear(...)` / `.setHours(...)` — browser-LOCAL setters — and:
- does NOT recompute `rawStartDate` / `rawEndDate` / `rawTimezone`, so they go stale. The
  timezone-change handlers (`EventCard.handleTimezoneChange` 66-77, `EventFields.handleTimezoneChange`
  142-156) then re-derive the displayed time from the STALE `rawStartDate` via `convertRawToDate`,
  discarding the manual edit (symptom 1).
- does NOT adjust `endDate` when `startDate` moves, so duration isn't preserved and start can pass
  end (symptom 2).
- handles only `startDate` / `startTime`, never `endDate` / `endTime` (symptom 3).

`EventFields` (the expanded editor) is closer to correct (it rebuilds the instant from the local
wall-time strings) but shares the stale-raw-fields issue.

#### Fix direction
- [x] On any manual date/time edit, recompute `rawStartDate` / `rawEndDate` from the new local wall
      time (keep raw ↔ instant in sync) so a subsequent timezone change doesn't revert the edit.
- [x] When `startDate` moves, shift `endDate` to preserve duration; never allow start > end (clamp or
      shift) — export validation should not be the first line of defense.
- [x] Add end date/time inline editing to `EventCard`, or route all card editing through `EventFields`.
- [x] Decide & document the model: card shows "your local time" (current behavior, per the tooltip)
      vs. the event's source zone — make edit + display consistent with that choice.

#### Tests (write them, then mutation-prove they fail on the bug)
- [x] E2E (webkit): edit start time → change timezone → the edited time is preserved.
- [x] Unit/E2E: moving start past end preserves duration (end shifts); the start ≤ end invariant holds.

- Location: `src/components/event-card/EventCard.tsx` (88-106, 66-86), `src/components/EventFields.tsx` (108-165)

#### Resolution & model decision (implemented)
- **Invariant restored:** every manual edit now calls `resyncRawFields` (new in `timeConversion.ts`,
  the inverse of `convertRawToDate` via `formatRawInTimezone`), so `convertRawToDate(rawStartDate,
  timezone) === startDate` always holds and a later timezone change reinterprets the EDITED time.
- **start ≤ end:** the card edits start only and shifts the end to preserve duration
  (`shiftEndPreservingDuration`); the expanded editor clamps (`clampEndNotBeforeStart`). Both
  guarantee start ≤ end at edit time, so export validation is no longer the first line of defense.
- **End editing:** kept in the expanded `EventFields` (chose the spec's "route … through EventFields"
  branch over adding end fields to the collapsed one-line card, per the Minimal-UI principle). Card
  start-edits preserve duration, so the end tracks automatically without a second inline field.
- **Display model (documented):** the card shows times in the viewer's local zone ("Times shown in
  your local time"); edits happen in that local zone; raw is stored in the event's source zone; the
  timezone picker reinterprets the source wall time in the chosen zone.
