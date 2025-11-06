### Task 116: Fix Save Button Not Clearing Unsaved Events

**Bug**: When user presses "Save", only selected events should be saved to history and ALL events (including non-selected ones) should be wiped from temporary storage and UI. Currently, non-selected events persist in storage and UI.

**Current Behavior**:
- When Save button is clicked, only selected events are:
  - Added to history
  - Removed from unsavedEvents state
- Non-selected events remain in:
  - `unsavedEvents` state
  - `TEMP_UNSAVED_EVENTS_KEY` localStorage
  - UI display

**Expected Behavior**:
- When Save button is clicked:
  - Selected events → added to history
  - ALL events → wiped from temporary storage
  - ALL events → removed from UI
  - Non-selected events → discarded entirely (not in history)

**Subtasks**:
- [x] Update `onExportComplete` callback in page.tsx to clear ALL unsavedEvents instead of just filtering out saved ones
- [x] Verify temporary storage is properly cleared after save
- [x] Test that only selected events appear in history
- [x] Test that non-selected events do not persist in UI or storage

**Location**:
- `src/app/page.tsx:687-691` - onExportComplete callback
- `src/components/BatchEventList.tsx:94-108` - handleExport function
