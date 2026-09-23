### Task 247: Turning backup on sends up what the browser already has, with a progress bar
- [x] Switching backup on uploads every original in this browser's history that the account does not already hold, three per request
- [x] A progress bar with a percentage under the switch, measured in bytes, gone when the run ends
- [x] Turning the switch off stops the run at the next batch
- [x] Files the server refused are counted and said, not silently dropped
- [x] Tests: skips what is backed up, batches, reaches 100%, stops, reports refusals
- Location: `src/services/attachmentBackup.ts`, `src/hooks/useAttachmentBackup.ts`, `src/components/account-bar/`, `src/components/SiteHeader.tsx`
