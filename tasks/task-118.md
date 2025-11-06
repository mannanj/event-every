### Task 118: Unsaved Events Not Persisting Correctly Across Page Refresh

## Expected Behavior

When a user adds events via images or text:
1. Events should be extracted and displayed in the "Unsaved Events" section
2. Events should be saved to localStorage under the key `event_every_temp_unsaved`
3. When the user refreshes the page (F5 or browser refresh), ALL unsaved events should:
   - Still be in localStorage
   - Load back into the UI
   - Display in the "Unsaved Events" section with the same count
4. Events should only be removed from localStorage when the user:
   - Clicks "Save" to move them to history
   - Clicks "Cancel All" to discard them
   - Manually deletes individual events

## Current Behavior (Broken)

**Test Case:**
1. User adds 3 images containing event information
2. System processes and extracts 6 events total:
   - Fall Medicine Dances (appears 3 times - these are duplicates from multiple images)
   - Weekly 5Rhythms Class - Source In Motion
   - AI & Espresso: Main Street AI Community Social
3. Events appear in "Unsaved Events" section with "Save (6)" button
4. User refreshes the page (without clicking Save)

**What Happens:**
- After refresh, only 3 events remain instead of all 6
- The 3 duplicate "Fall Medicine Dances" events get reduced to 1
- Data loss occurs - user did not request any changes

**Evidence:**
- Screenshot 1: Shows 3 images uploaded
- Screenshot 2: Shows processing in progress ("Calculating the space-time coordinates...")
- Screenshot 3: Shows 6 events in unsaved section with "Save (6)" button
- Screenshot 4: After refresh, only 3 events remain

## Additional Observations

- The issue happens on both localhost and production (Vercel)
- localStorage key used: `event_every_temp_unsaved`
- Deduplication logic has been removed (Task 117), but issue persists
- Single text-based events DO persist correctly after refresh
- Issue appears to be specific to multiple events or image-based events

## What We Need to Investigate

1. Are all 6 events being written to localStorage initially?
2. What is the localStorage content immediately after processing?
3. What is the localStorage content immediately after refresh?
4. Is something clearing or overwriting localStorage during page load?
5. Is there a race condition during the initial load?
6. Are events being deduplicated somewhere else in the code?

## Location

- `src/app/page.tsx` (lines 62-78: localStorage load/save effects)
- `src/services/storage.ts` (getTempUnsavedEvents, saveTempUnsavedEvents)
- `src/components/UnsavedEventsSection.tsx`

## Priority

**HIGH** - This is a critical data loss bug that prevents users from reliably saving multiple events.
