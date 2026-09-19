### Task 226: Remove a card, with a few seconds to change your mind

A card could only leave the list by discarding every card at once. This adds a
trash control beside the caret that removes one, and leaves a slim undo row in
the spot it occupied for five seconds.

The event leaves the list immediately rather than being flagged in place, so a
card awaiting undo can never be counted by the footer or swept into an export.
The snapshot needed to put it back lives in the hook instead.

- [x] Trash button inline with the caret on each card
- [x] `useUndoableRemoval`: owns the snapshot, the five second window and the one undoable slot
- [x] `restoreAt` puts the event back at its own index, not at the end
- [x] Undo restores the card's selected state, which the reconciler would otherwise drop
- [x] A second removal makes the first permanent, so the row never has to say which event it means
- [x] The section outlives its last card while the undo is still on offer, then closes
- Location: `src/hooks/useUndoableRemoval.ts`, `src/components/event-card/UndoRemovalRow.tsx`, `src/components/event-card/EventCard.tsx`, `src/components/event-card/EventCardList.tsx`, `src/components/UnsavedEventsSection.tsx`, `src/app/page.tsx`
