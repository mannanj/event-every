### Task 79: Debug Attachments Not Showing in History Panel

- [ ] Investigate why attachments don't display in history panel despite code being present
- [ ] Code is in place at src/components/HistoryPanel.tsx:183-192
- [ ] Attachments show correctly in EventConfirmation, EventEditor, and BatchEventList
- [ ] Possible issues to check:
  - LocalStorage/IndexedDB not saving attachments with events
  - useHistory hook not loading attachments properly
  - Event data structure mismatch when reading from history
- Location: `src/components/HistoryPanel.tsx`, `src/hooks/useHistory.ts`, `src/services/storage.ts`
