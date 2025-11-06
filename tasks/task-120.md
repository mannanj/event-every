### Task 120: Add Attachment Support to Events
- [ ] Update CalendarEvent interface in `src/types/event.ts` to include attachments array
- [ ] Add file picker UI with attach icon to EventEditor component
- [ ] Implement file selection and storage (convert to base64 or store in IndexedDB)
- [ ] Add attachment display with X button to remove attachments
- [ ] Update event storage service to persist attachments
- [ ] Update iCal exporter to include attachments using ATTACH property
- [ ] Test attachment addition and removal in event history
- Location: `src/types/event.ts`, `src/components/EventEditor.tsx`, `src/services/storage.ts`, `src/services/exporter.ts`
