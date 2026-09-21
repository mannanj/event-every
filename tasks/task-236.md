### Task 236: Attachments sit with the fields, and saved events get an accordion
- [x] Drop the ATTACHMENTS header; the tile row alone sits under the fields
- [x] Move the row into the card body, below URL, left-aligned with the field labels
- [x] Space it at twice the field gap so it reads as its own group, not one more field
- [x] Add a reusable `sm` tile size at half the input's 128px, dropping the index badge that no longer fits
- [x] Stamp saved events with their input-history rows so Your Events can find its files
- [x] Give the saved cards an accordion, bin to the left of the chevron, files shown only when open
- Location: `src/components/InputAttachments.tsx`, `src/components/EventFields.tsx`, `src/components/event-card/EventCard.tsx`, `src/components/event-card/EventCardList.tsx`, `src/app/page.tsx`, `src/types/event.ts`, `e2e/review-attachments.spec.ts`
