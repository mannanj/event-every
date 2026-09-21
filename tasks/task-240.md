### Task 240: One card for both lists, on one spacing rhythm
- [x] Even out the field rows: one leading for all, ~10px between glyphs instead of 21/14.8/13.8/12
- [x] Keep the attachments at twice that gap, measured between glyphs rather than margins
- [x] Drop the one-line date summary once a card is open - Start and End already say it
- [x] Reuse EventCard for saved events: same title, bin, chevron, fields and attachments
- [x] Review cards arrive open with a checkbox; saved cards arrive shut with Created + Export
- [x] Guard the card against an invalid stored date, which crashed the list through Intl
- [x] Update the suite for the new defaults: collapse where a test drives the summary's own editors
- Location: `src/components/event-card/EventCard.tsx`, `src/components/EventFields.tsx`, `src/components/event-card/EventCardList.tsx`, `src/app/page.tsx`, `e2e/`
