### Task 165: Migrate Storage from localStorage to IndexedDB - Fix Lost Unsaved Events

#### Issue:
- "Unsaved events" (temp events pending save) are lost on page refresh
- Previously worked with localStorage but now broken
- Need reliable persistence that survives page refreshes
- localStorage has 5-10MB limit, insufficient for many events with attachments

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

#### Root Cause Analysis Needed:
- Check if `saveTempUnsavedEvents()` is being called correctly in page.tsx:105
- Check if `getTempUnsavedEvents()` is being called on mount
- Verify localStorage quota isn't exceeded
- Verify events are actually being written to localStorage
- Check browser console for storage errors

#### Migration Plan: localStorage → IndexedDB

**Why IndexedDB:**
- No practical size limit (hundreds of MB available)
- Handles large attachments (base64 images) efficiently
- Better performance for bulk operations
- Asynchronous API (doesn't block UI)
- Structured data storage

**Current localStorage Keys:**
- `event_every_history` - Saved event history
- `event_every_temp_unsaved` - Temporary unsaved events

#### Subtasks:

**Phase 1: Investigation**
- [ ] Debug why temp unsaved events are lost on refresh
- [ ] Check if useEffect on line 102-109 is running
- [ ] Verify `saveTempUnsavedEvents` is writing to localStorage
- [ ] Check browser console for storage quota errors
- [ ] Test if problem is localStorage size limit
- [ ] Document exact reproduction steps

**Phase 2: IndexedDB Implementation**
- [ ] Create `src/services/indexedDBStorage.ts` service
- [ ] Define IndexedDB schema (database name, object stores, indexes)
- [ ] Implement database initialization and migration logic
- [ ] Implement CRUD operations for events
- [ ] Implement operations for temp unsaved events
- [ ] Add proper error handling for quota exceeded
- [ ] Add proper error handling for private browsing mode

**Phase 3: Migration Logic**
- [ ] Create migration function to move existing localStorage data to IndexedDB
- [ ] Run migration automatically on first load after update
- [ ] Preserve all existing event data during migration
- [ ] Clean up old localStorage keys after successful migration
- [ ] Add migration status tracking

**Phase 4: Update Storage Service**
- [ ] Update `src/services/storage.ts` to use IndexedDB instead of localStorage
- [ ] Keep same API interface for backward compatibility
- [ ] Update all storage calls to be async
- [ ] Update components using storage to handle async operations
- [ ] Add loading states where needed

**Phase 5: Testing**
- [ ] Test: Create events, refresh, verify they persist
- [ ] Test: Large attachments (5MB+ images) work
- [ ] Test: Migration from existing localStorage data
- [ ] Test: Private browsing mode (should show warning)
- [ ] Test: Storage quota exceeded handling
- [ ] Test: Multiple tabs open simultaneously
- [ ] Test: Import large batch of events (50+ events)

#### Technical Details:

**IndexedDB Schema:**
```typescript
Database: 'EventEveryDB'
Version: 1

Object Stores:
1. 'events' (saved history)
   - keyPath: 'id'
   - indexes: ['created', 'startDate', 'title']

2. 'tempEvents' (unsaved events)
   - keyPath: 'id'
   - indexes: ['created']
```

**New Service Interface:**
```typescript
// src/services/indexedDBStorage.ts
export const indexedDBStorage = {
  // Initialize database
  init(): Promise<void>

  // Events CRUD
  saveEvent(event: CalendarEvent): Promise<StorageResult<void>>
  saveEvents(events: CalendarEvent[]): Promise<StorageResult<void>>
  getAllEvents(): Promise<StorageResult<CalendarEvent[]>>
  updateEvent(event: CalendarEvent): Promise<StorageResult<void>>
  deleteEvent(id: string): Promise<StorageResult<void>>

  // Temp unsaved events
  saveTempUnsavedEvents(events: CalendarEvent[]): Promise<StorageResult<void>>
  getTempUnsavedEvents(): Promise<StorageResult<CalendarEvent[]>>
  clearTempUnsavedEvents(): Promise<StorageResult<void>>

  // Migration
  migrateFromLocalStorage(): Promise<StorageResult<void>>
}
```

**Update storage.ts to proxy to IndexedDB:**
```typescript
// Keep same synchronous-looking API but use IndexedDB underneath
export const eventStorage = {
  saveEvent: async (event: CalendarEvent): Promise<StorageResult<void>> => {
    return await indexedDBStorage.saveEvent(event);
  },
  // ... rest of methods
}
```

**Handle async in components:**
```typescript
// page.tsx - Update to handle async
useEffect(() => {
  const loadTempEvents = async () => {
    const result = await eventStorage.getTempUnsavedEvents();
    if (result.success && result.data) {
      setUnsavedEvents(result.data);
    }
  };
  loadTempEvents();
}, []);
```

#### Quick Fix (Before Full Migration):
If IndexedDB migration is too large, first fix localStorage issue:
- [ ] Add debug logging to saveTempUnsavedEvents
- [ ] Add debug logging to getTempUnsavedEvents on load
- [ ] Check if useEffect dependencies are correct
- [ ] Verify localStorage.setItem is not throwing errors
- [ ] Add try-catch with console.error around storage calls

#### References:
- Current storage: `src/services/storage.ts`
- Usage in page: `src/app/page.tsx:102-109` (save), needs load on mount
- IndexedDB API: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API

#### Priority:
**HIGH** - Users losing work on refresh is critical UX issue

- Location: `src/services/storage.ts`, `src/services/indexedDBStorage.ts` (new), `src/app/page.tsx`
