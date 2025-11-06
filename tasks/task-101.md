### Task 101: Fix Unsaved Events Persistence & Processing/Unsaved Sections Separation

**Problem Summary:**
When processing new images/text while unsaved events exist, the unsaved events section disappears and appears to be wiped. The processing status and unsaved events are not clearly separated, causing confusion and potential data loss.

**Root Causes:**

1. **UI Conditional Rendering Bug** (`ProcessingSection.tsx:124`)
   - `hasCompletedBatch = batchProcessing && !batchProcessing.isProcessing && batchProcessing.events.length > 0`
   - When `isProcessing` becomes `true`, `hasCompletedBatch` becomes `false`
   - Batch event list only renders when `hasCompletedBatch` is true (line 238)
   - Result: Existing unsaved events disappear from UI when new processing starts

2. **Conflated State Management** (`page.tsx`)
   - Single `batchProcessing` state tracks both active processing AND unsaved events
   - `isProcessing` flag gates UI visibility of unsaved events
   - No independent state for accumulated unsaved events

3. **Section Separation**
   - Processing status and unsaved events share the same `ProcessingSection` component
   - Not visually or logically distinct
   - User cannot simultaneously view processing progress and unsaved events clearly

**Engineering Approach:**

### Phase 1: Separate State Management (`page.tsx`)

- [x] Create new independent `unsavedEvents` state: `useState<CalendarEvent[]>([])`
- [x] Keep `batchProcessing` only for tracking active processing status
- [x] Refactor `handleImageSelect` to:
  - Set `batchProcessing` with `isProcessing: true` and empty events array
  - When events stream in (lines 348-354), append to `unsavedEvents` state
  - When processing completes (line 374), set `isProcessing: false` but keep events in `unsavedEvents`
- [x] Refactor `handleTextSubmit` similarly (lines 531-537)
- [x] Update temp storage logic to save/restore `unsavedEvents` instead of `batchProcessing.events`

### Phase 2: Split Processing Section Components

- [x] Create new `UnsavedEventsSection.tsx` component
  - Takes `events: CalendarEvent[]` prop
  - Shows title "Unsaved Events" with count badge
  - Renders `BatchEventList` component
  - Includes Export All and Cancel All buttons
  - Always visible when `events.length > 0`, independent of processing state
- [x] Refactor `ProcessingSection.tsx` to only show active processing status
  - Remove batch event list rendering (lines 237-252)
  - Only show when `hasActiveProcessing` is true
  - Displays: image processing statuses, URL processing status, fun messages
  - Remove `batchProcessing.events` handling
- [x] Update `page.tsx` to render two separate sections:
  ```tsx
  <ProcessingSection
    imageProcessingStatuses={...}
    urlProcessingStatus={...}
    isProcessing={isProcessing}
  />

  <UnsavedEventsSection
    events={unsavedEvents}
    onEdit={...}
    onDelete={...}
    onExport={...}
    onCancelAll={...}
    onExportAll={...}
  />
  ```

### Phase 3: Robust Event Accumulation

- [x] Implement additive event accumulation pattern:
  ```typescript
  // When new events arrive
  setUnsavedEvents(prev => {
    const combined = [...prev, ...newEvents];
    return deduplicateEvents(combined);
  });
  ```
- [x] Ensure deduplication runs on full accumulated pool, not per batch
- [x] Handle mixed source types (text + image) gracefully

### Phase 4: Update Temp Storage Integration

- [x] Modify `useEffect` (lines 77-85) to sync `unsavedEvents` instead of `batchProcessing.events`
- [x] Update initial load (lines 62-75) to restore into `unsavedEvents` state
- [x] Ensure storage clears only when user explicitly:
  - Exports all events to history
  - Cancels/deletes all unsaved events
  - Successfully saves events

### Phase 5: Update Event Handlers

- [x] Update `handleBatchEventDelete` to modify `unsavedEvents` state
- [x] Update `handleBatchEventExport` to remain working with new state
- [x] Update `onExportComplete` callback (line 726-741) to:
  - Add events to history
  - Remove exported events from `unsavedEvents`
  - Clear temp storage if `unsavedEvents` becomes empty
- [x] Update `handleCancelBatch` to clear `unsavedEvents`

### Phase 6: Visual Distinction

- [x] Style `ProcessingSection` with distinct visual treatment:
  - Gray background with "Processing..." header
  - Animated indicators
  - Temporary, ephemeral feel
- [x] Style `UnsavedEventsSection` with distinct visual treatment:
  - White background with black border
  - "Unsaved Events" header with count badge
  - Persistent, important feel
  - Grouped action buttons (Export All, Cancel All)

### Phase 7: Testing & Validation

- [x] Test: Add image → events appear in unsaved section
- [x] Test: Add more images while unsaved events exist → both sections visible
- [x] Test: Processing section shows progress, unsaved section remains visible
- [x] Test: Refresh page → unsaved events persist
- [x] Test: Add text after images → all events accumulate in unsaved section
- [x] Test: Export some events → only exported ones move to history
- [x] Test: Export all → all events move to history, unsaved section clears
- [x] Test: Cancel all → unsaved section clears, temp storage cleared

**Expected Outcome:**

1. Processing status and unsaved events are two completely separate, independent sections
2. Unsaved events remain visible at all times, regardless of processing state
3. New processing adds to existing unsaved events without hiding them
4. Clear visual distinction between temporary processing status and persistent unsaved events
5. Robust state management prevents any data loss
6. Temp storage accurately reflects unsaved events across page refreshes

**Location:**
- `src/app/page.tsx`
- `src/components/ProcessingSection.tsx`
- `src/components/UnsavedEventsSection.tsx` (new file)
- `src/components/BatchEventList.tsx` (reuse)
