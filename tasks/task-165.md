### Task 165: Fix Unsaved Events Persistence in IndexedDB

#### Prerequisites:
⚠️ **This task assumes IndexedDB migration is already complete** (see separate IndexedDB migration task in backlog)

#### Issue:
- "Unsaved events" (temp events pending save) are lost on page refresh
- Need to ensure temp events persist in IndexedDB after migration
- Currently saving to localStorage, need to verify IndexedDB equivalent works

#### Current Behavior:
1. User creates events via Transform
2. Events appear in "Unsaved Events" section
3. User refreshes page
4. ❌ Unsaved events are lost (should persist)

#### Expected Behavior:
1. User creates events via Transform
2. Events appear in "Unsaved Events" section
3. User refreshes page
4. ✅ Unsaved events still visible (loaded from IndexedDB)

#### Current Implementation (localStorage):
- Save location: `page.tsx:105` - `eventStorage.saveTempUnsavedEvents(unsavedEvents)`
- Load location: **MISSING** - No code to load temp events on mount
- Storage key: `event_every_temp_unsaved`

#### Subtasks:

**Phase 1: Root Cause Analysis**
- [ ] Debug why temp unsaved events are lost on refresh
- [ ] Check if useEffect on line 102-109 is running and saving
- [ ] **CRITICAL**: Check if there's code to LOAD temp events on mount (likely missing!)
- [ ] Add console.log to verify save/load cycle
- [ ] Document exact reproduction steps

**Phase 2: Fix Implementation (Using IndexedDB)**
- [ ] Add useEffect to load temp unsaved events on component mount
- [ ] Ensure `getTempUnsavedEvents()` is called when page loads
- [ ] Verify IndexedDB storage service has `saveTempUnsavedEvents()` method
- [ ] Verify IndexedDB storage service has `getTempUnsavedEvents()` method
- [ ] Handle async loading with loading state if needed
- [ ] Clear temp events from IndexedDB when user clicks "Save All"

**Phase 3: Testing**
- [ ] Test: Create events, refresh, verify they persist in IndexedDB
- [ ] Test: Save All button clears temp events from IndexedDB
- [ ] Test: Multiple events persist correctly
- [ ] Test: Events with attachments persist correctly

#### Technical Details:

**Required Code Addition (page.tsx):**
```typescript
// Add this useEffect to LOAD temp unsaved events on mount
useEffect(() => {
  const loadTempEvents = async () => {
    if (!hasLoadedTempEvents) {
      const result = await eventStorage.getTempUnsavedEvents();
      if (result.success && result.data && result.data.length > 0) {
        setUnsavedEvents(result.data);
      }
      setHasLoadedTempEvents(true);
    }
  };
  loadTempEvents();
}, [hasLoadedTempEvents]);

// Existing save useEffect (already exists around line 102-109)
useEffect(() => {
  if (!hasLoadedTempEvents) return;

  if (unsavedEvents.length > 0) {
    eventStorage.saveTempUnsavedEvents(unsavedEvents);
  } else {
    eventStorage.clearTempUnsavedEvents();
  }
}, [unsavedEvents, hasLoadedTempEvents]);
```

**Storage Service Requirements (Handled by IndexedDB Migration):**
The IndexedDB storage service must implement:
- `saveTempUnsavedEvents(events: CalendarEvent[]): Promise<StorageResult<void>>`
- `getTempUnsavedEvents(): Promise<StorageResult<CalendarEvent[]>>`
- `clearTempUnsavedEvents(): Promise<StorageResult<void>>`

**Clear Temp Events on Save All:**
```typescript
// When user clicks "Save All" button
const handleSaveAll = async () => {
  await eventStorage.saveEvents(unsavedEvents);
  await eventStorage.clearTempUnsavedEvents(); // Clear from IndexedDB
  setUnsavedEvents([]); // Clear from UI state
};
```

#### References:
- Current storage: `src/services/storage.ts`
- Usage in page: `src/app/page.tsx:102-109` (save only - MISSING load on mount!)
- Related: IndexedDB migration task (separate ticket in backlog)

#### Priority:
**HIGH** - Users losing work on refresh is critical UX issue

#### Likely Root Cause:
The code saves temp events but **never loads them back** when the page mounts. Need to add a useEffect to call `getTempUnsavedEvents()` on component mount.

- Location: `src/app/page.tsx` (add load useEffect)
