### Task 113: Handle Race Condition During Save with Concurrent Event Processing
- [ ] Implement logic to snapshot selected events when Save is clicked
- [ ] Ensure only snapshotted events are saved to history
- [ ] Prevent newly incoming events from being included in current save batch
- [ ] Ensure newly incoming events appear in UI after save completes
- [ ] Ensure unselected events are NOT saved to history
- [ ] Test concurrent processing: save while new events are being parsed
- Location: `src/components/BatchEventList.tsx`, `src/components/UnsavedEventsSection.tsx`, `src/app/page.tsx`

#### Problem
Currently, if user clicks Save while new events are still being processed, there's a potential race condition:
1. User selects 3 events from 5 visible events
2. User clicks Save
3. During save operation, 2 new events arrive
4. Risk: New events might be accidentally included/excluded from save batch
5. Risk: New events might disappear without user seeing them

#### Requirements
**When user clicks Save:**
1. Snapshot the current selected event IDs at moment of click
2. Only save those specific events to history
3. Generate .ics files only for those events
4. Unselected events should NOT make it to history
5. New events arriving after Save click should:
   - NOT be included in current save batch
   - NOT be accidentally removed
   - Appear in UI after save completes
   - Be available for next save operation

#### Implementation Approach
1. **Snapshot on Save**: When Save button clicked, capture `selectedEventIds` immediately
2. **Filter by snapshot**: Use snapshotted IDs for export, not current state
3. **Remove only saved**: After export, remove only the saved events from unsaved list
4. **Preserve new arrivals**: Events that arrived after save click remain in unsaved list

#### Edge Cases to Handle
- Events arriving between save click and save completion
- Multiple rapid saves (debounce/disable during save)
- User deselecting events while save is processing
- Event list updates while save operation is in progress

#### Success Criteria
- ✅ Saved events go to history
- ✅ Unselected events do NOT go to history
- ✅ New events arriving during save are preserved
- ✅ No events lost or accidentally saved
- ✅ Clean UI state after save completes
