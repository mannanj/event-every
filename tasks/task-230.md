### Task 230: Every removal gets its own undo, in the card's own columns

Two changes to the undo row.

The one-undoable-at-a-time rule is gone. Removing a second card no longer makes
the first permanent: each removal waits on its own five second clock and its row
disappears when that clock runs out, so several can be waiting at once and any of
them can be taken back.

The row now borrows the card's columns instead of sitting at its own edges. The
name reads from where a card's title starts, and the word "Undo" ends exactly
under the trash icon that removed it, not under that icon's hit area, which is
4px wider.

- [x] `pending` is a list; each removal holds its own timer, keyed by event id
- [x] `removalsAtPosition` places each row before the card that took its place, ties broken by removal order
- [x] Rows past the end gather on the last position, which is what an emptied list is
- [x] `undo(id)` takes back one removal and leaves the others waiting
- [x] Row restyled: italic "<name> removed" at 14px in the title column, undo icon beside a 14px "Undo"
- [x] Alignment pinned by measurement, not by eye: both deltas assert to 0
- Location: `src/hooks/useUndoableRemoval.ts`, `src/components/event-card/UndoRemovalRow.tsx`, `src/components/event-card/EventCardList.tsx`, `src/components/UnsavedEventsSection.tsx`, `src/app/page.tsx`

Also fixes the storyboard config, where `...devices['Desktop Chrome']` was
spread after `viewport`, silently discarding the viewport and the 2x scale.
