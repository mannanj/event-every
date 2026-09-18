### Task 220: Never fill a missing date from the clock
- [x] A candidate with no start carries `startMissing`; the placeholder date keeps sorting and storage working
- [x] The card shows "Add a date" instead of the scan moment, and entering a date clears the flag
- [x] Export refuses such a card in plain words, single and batch
- [x] Tests for the review layer and the exporter
- Location: `src/types/event.ts`, `src/services/reviewEvent.ts`, `src/services/exporter.ts`, `src/components/event-card/EventCard.tsx`
