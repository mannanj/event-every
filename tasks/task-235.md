### Task 235: The review panel shows the files it was built from
- [x] Add an Attachments row to the unsaved-events panel, between the cards and Save
- [x] Reuse SmartInput's 128px tile language and the existing ImageModal lightbox
- [x] Read the files from the IndexedDB input history by entry id, so a reload rebuilds the row
- [x] Drop the attachments when the batch is saved or discarded
- [x] Cover it with e2e: render, reload, second scan appends, discard clears, lightbox opens
- Location: `src/components/InputAttachments.tsx`, `src/components/event-card/EventCardList.tsx`, `src/components/UnsavedEventsSection.tsx`, `src/app/page.tsx`, `src/services/storage.ts`, `e2e/review-attachments.spec.ts`
