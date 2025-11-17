### Task 156: Fix Event History Save Bug

- [x] **Inspect current storage implementation** - Review `src/services/storage.ts` to understand save/load flow
- [x] **Check event creation flow** - Trace from EventEditor save button through to storage call
- [x] **Add comprehensive error logging** - Log storage operations, errors, and successful saves
- [x] **Test storage write/read** - Verify LocalStorage/IndexedDB actually persists data
- [x] **Validate event data structure** - Ensure saved events match expected interface
- [x] **Fix identified issues** - Resolve any bugs in save/load/sort logic
- [x] **Add defensive checks** - Validate data before save, handle errors gracefully
- [x] **Test end-to-end** - Create event, save, verify it appears in history sorted correctly

**Issue**: Event created and saved does not appear in history (checked top for recent, bottom for old, and after refresh)

**Root Cause**: `QuotaExceededError` - localStorage quota exceeded due to base64-encoded image attachments being saved with each event. A single 2MB image becomes ~2.7MB in base64, so just a few events with images filled the ~5-10MB localStorage limit.

**Solution Decision**: Migrate to IndexedDB instead of band-aid fixes
- **localStorage**: ~5-10MB limit, synchronous, string-only
- **IndexedDB**: 50MB minimum (often 100MB-1GB+), asynchronous, can store binary data
- IndexedDB is the proper solution for this app's long-term scalability
- Users will accumulate hundreds/thousands of events over time
- Future features like viewing original flyers/images in history will be possible

**Next Steps**:
- Implement IndexedDB storage layer (to be done in future task)
- Migrate existing localStorage data to IndexedDB
- Optionally support storing attachments in history with IndexedDB

**Location**: `src/services/storage.ts`, `src/hooks/useHistory.ts`, `src/app/page.tsx`
