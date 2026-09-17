### Task 218: Data outranks the model's flags: complete the year, promote partial points, collapse all-day midnight ranges
- [x] `normalizeTemporal` runs before every review draft: a month and day with no year get the current year, a complete partial point becomes a date or date-time, and all-day expressed as 00:00 to 23:59 becomes a date
- [x] Model-emitted issues that contradict returned data are dropped; readiness re-derives the rest
- [x] The reliability eval scores normalized candidates, so it measures what the card shows
- [x] Prompt-side variants were A/B tested on the real set and rejected (91% to 78%); the prompt is unchanged
- Location: `src/services/temporalNormalize.ts`, `src/services/scannerDraft.ts`, `scripts/measure-scan-reliability.ts`
