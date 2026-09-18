### Task 221: Three small date fixes: keep the last day, keep a stated hour, show an assumed year
- [x] A stated all-day end exports as the day after the last day, and a 23:59 or midnight end on a later day keeps that day
- [x] A stated hour with no minute is a time at :00, not an all-day date, in both the normalization and the review layer
- [x] When the year was filled in, the draft and the card say so with "(year assumed)"
- [x] Tests for every case in normalization, review, and draft layers
- Location: `src/services/temporalNormalize.ts`, `src/services/reviewEvent.ts`, `src/services/scannerDraft.ts`, `src/types/review.ts`
