### Task 69: Event Attachment Management
- [ ] Add attachment storage to event model
- [ ] Implement drag-and-drop zone on event card
- [ ] Support file upload (images, PDFs, documents)
- [ ] Display attachment thumbnails/list in event card
- [ ] Add attachment viewer modal
- [ ] Store attachments in IndexedDB (base64 or blob)
- [ ] Add attachment deletion with confirmation
- Location: `src/components/EventCard.tsx`, `src/services/storage.ts`, `src/types/event.ts`

**Notes:**
- Attachment zone could be collapsible section in event card
- Consider file size limits (IndexedDB has ~50MB practical limit per domain)
- Thumbnails for images, icons for other file types
