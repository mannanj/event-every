### Task 222: Scans wait their turn, and a busy scanner says so in plain words
- [x] The processing queue runs one item at a time, so a second submit waits instead of being refused and dropped
- [x] The "already pending" guards, in the page and the provider-operation store, now read "Another scan is still running. Wait for it to finish, then try again."
- [x] Queue test for the one-at-a-time order; guard tests updated
- Location: `src/services/processingQueue.ts`, `src/services/providerOperation.ts`, `src/app/page.tsx`
