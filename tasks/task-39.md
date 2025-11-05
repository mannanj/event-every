### Task 39: Duplicate Detection - Storage Integration

- [ ] Modify `src/services/storage.ts` to add duplicate checking
- [ ] Update `saveEvent()` to trigger duplicate detection
- [ ] Update `saveEvents()` for batch duplicate checking
- [ ] Add `replaceEvent()` function for merge operations
- [ ] Handle race conditions and concurrent saves
- [ ] Add proper error handling and rollback logic
- [ ] Test integration with existing storage functions

**Location**: `src/services/storage.ts`

**Details**: Integrate duplicate detection into save flow. Changes:
- Intercept `saveEvent()` to check duplicates before saving
- For batch imports, check each event against existing + new batch
- Add `replaceEvent()` to swap duplicate with merged version
- Ensure atomic operations (save succeeds or fails completely)
- Don't break existing functionality (backward compatible)
- Add opt-out flag to skip detection when needed
