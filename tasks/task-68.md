### Task 68: Event Version History
- [ ] Modify event storage to use version array structure
- [ ] Save each edit as new version (preserve all fields except attachment files)
- [ ] Add history icon to event card
- [ ] Create VersionHistoryModal component
- [ ] Implement git diff-style comparison view
- [ ] Add restore functionality to revert to previous version
- [ ] Show version metadata (timestamp, what changed)
- Location: `src/services/storage.ts`, `src/components/VersionHistoryModal.tsx`, `src/types/event.ts`

**Dependencies:** Task 67

**Notes:**
- Store versions as array: `{ versions: [v1, v2, v3], currentVersion: 2 }`
- Attachment files stored once, referenced by all versions
- Diff view should highlight changed fields
- Consider space limits for LocalStorage/IndexedDB
