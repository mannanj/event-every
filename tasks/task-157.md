### Task 157: Migrate LocalStorage to IndexedDB

**Purpose**: Solve storage quota issues by migrating from LocalStorage (~5-10MB limit) to IndexedDB (50MB-1GB+)

**Background**:
- Current issue: `QuotaExceededError` when saving events with image attachments
- LocalStorage limitation: ~5-10MB, synchronous, string-only storage
- IndexedDB benefits: 50MB minimum (often 100MB-1GB+), asynchronous, binary data support
- Events include base64 attachments that quickly exceed localStorage limits

**Requirements**:
- Migrate all existing data from LocalStorage to IndexedDB
- Support async operations (IndexedDB is asynchronous)
- Store events with attachments efficiently (consider binary storage for attachments)
- Maintain same API interface so hooks don't need major changes
- Auto-migrate on first load if LocalStorage data exists
- Clean up LocalStorage after successful migration
- Preserve user settings (sort preferences, etc.)

**Data to Migrate**:
- Event history (`event_every_history` key)
- Temp unsaved events (`event_every_temp_unsaved` key)
- Sort preferences (`event-sort-option` key)
- Any other app settings in LocalStorage

**IndexedDB Schema**:
- Database: `EventEveryDB`
- Object Stores:
  - `events` - calendar events (keyPath: `id`, indexes: `created`, `startDate`)
  - `tempEvents` - temporary unsaved events
  - `settings` - user preferences (keyPath: `key`)

**Subtasks**:
- [ ] Create IndexedDB service (`src/services/indexedDB.ts`)
- [ ] Define database schema with version management
- [ ] Implement CRUD operations (async versions of current storage methods)
- [ ] Create migration utility to detect and migrate LocalStorage data
- [ ] Update storage service to use IndexedDB instead of LocalStorage
- [ ] Update useHistory hook to handle async operations
- [ ] Test migration with existing data
- [ ] Test event save/load/update/delete with IndexedDB
- [ ] Clean up LocalStorage after successful migration
- [ ] Handle edge cases (migration failures, partial data, etc.)

**Location**: `src/services/storage.ts`, `src/services/indexedDB.ts`, `src/hooks/useHistory.ts`

**Technical Notes**:
- Use IndexedDB wrapper or raw API (consider `idb` library for cleaner async/await)
- Maintain StorageResult interface for consistent error handling
- Consider storing attachments as Blob instead of base64 strings (more efficient)
- Handle DB version upgrades for future schema changes
- Test with large datasets (100+ events with attachments)
