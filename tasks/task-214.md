### Task 214: Pre-fill the end time from a typical duration instead of a fixed hour
- [x] Triage asks a duration Score in the same call; applied only for a single-event input with confidence at or above 0.6
- [x] The end is replaced only when the source stated no end and the event is not all-day
- [x] Tests for the score parsing, the gating, and the pure end-time helper
- Location: `src/server/typesafe/triage.ts`, `src/services/scanTriage.ts`, `src/app/page.tsx`
