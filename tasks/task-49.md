### Task 49: Multi-Location Events with Sub-Times

**Goal:** Support events with multiple sequential locations (e.g., wedding ceremony → photos → reception)

**Context:**
- Current .ics standard only supports one LOCATION field per event
- For now: Export as multiple linked calendar events for compatibility
- Future: Build custom calendar software to display as single multi-stop event
- Data model must support BOTH approaches

**Phase 1: Data Model**
- [ ] Create `EventLocation` interface:
  ```typescript
  interface EventLocation {
    id: string;
    address: string;
    startTime: Date;
    endTime: Date;
    title?: string;  // "Ceremony", "Reception", etc.
    order: number;
  }
  ```
- [ ] Update `CalendarEvent` to support:
  ```typescript
  interface CalendarEvent {
    // ... existing fields
    isMultiLocation: boolean;
    locations: EventLocation[];  // Multiple stops
    location?: string;  // Legacy single location
  }
  ```
- [ ] Add migration logic for existing single-location events

**Phase 2: EventEditor UI for Multi-Location**
- [ ] Add "Add Another Location" button in EventEditor
- [ ] Display locations as ordered list with times
- [ ] Allow reordering locations (drag-drop or up/down buttons)
- [ ] Each location has:
  - Title (optional): "Ceremony", "Reception", etc.
  - Address field (with validation from task-46)
  - Start/end time fields
  - Remove button
- [ ] Validate no time overlaps between locations

**Phase 3: .ics Export Strategy (Multi-Event)**
- [ ] Detect `isMultiLocation: true` during export
- [ ] Generate separate .ics events for each location:
  ```
  Event 1: "Wedding - Ceremony" @ 2:00 PM - St. Mary's Church
  Event 2: "Wedding - Photos" @ 4:00 PM - Golden Gate Park
  Event 3: "Wedding - Reception" @ 6:00 PM - Grand Hotel
  ```
- [ ] Link events with UID patterns (e.g., `event-123-1`, `event-123-2`)
- [ ] Add "Part X of Y" to description for clarity

**Phase 4: Storage Updates**
- [ ] Update `storage.ts` to save/load multi-location events
- [ ] Update HistoryPanel to display multi-location badge/indicator
- [ ] Show full location sequence on event preview

**Phase 5: Future-Proof for Custom Calendar**
- [ ] Keep `locations[]` array intact in storage
- [ ] Add feature flag: `ENABLE_CUSTOM_CALENDAR_VIEW`
- [ ] When flag enabled: Display as single event with timeline
- [ ] When flag disabled: Export as multiple .ics events

**Testing:**
- [ ] Create wedding event with 3 locations
- [ ] Verify .ics export creates 3 separate events
- [ ] Import to Apple Calendar, Google Calendar, Outlook
- [ ] Verify GPS navigation works for each location
- [ ] Test reordering, editing, removing locations
- [ ] Test single-location events still work (backward compatibility)

**Location:**
- `src/types/event.ts` (update interfaces)
- `src/components/EventEditor.tsx` (multi-location UI)
- `src/services/exporter.ts` (multi-event .ics generation)
- `src/services/storage.ts` (save/load logic)
- `src/components/HistoryPanel.tsx` (display indicator)
