### Task 248: A backup in progress warns before you leave, and resumes if you do
- [x] The browser's own "leave site?" prompt while originals are uploading, and only then
- [x] An interrupted run resumes on the next load, from what the account already holds
- [x] One run per tab, outside React, so navigating between pages cannot orphan it or start a second
- [x] The resume marker is cleared on finish or on switching off, so deleting the account's copies does not re-upload them
- Location: `src/services/backfillRun.ts`, `src/hooks/useAttachmentBackup.ts`
