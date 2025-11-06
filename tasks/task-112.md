### Task 112: Merge Processing and Unsaved Events Sections
- [x] Remove "Made some events" header from BatchEventList component
- [x] Integrate ProcessingSection content into UnsavedEventsSection
- [x] Create unified section showing: status label + skeleton (when processing) → unsaved events → save button
- [x] Update UnsavedEventsSection to accept processing-related props
- [x] Update page.tsx to pass processing props to unified section
- Location: `src/components/BatchEventList.tsx`, `src/components/UnsavedEventsSection.tsx`, `src/app/page.tsx`

#### Current Structure
- **ProcessingSection** (separate): Status label with rainbow animation ("Consulting the calendar spirits...") + skeleton loaders
- **UnsavedEventsSection** (separate): "Made some events" header + event list + save button

#### Target Structure
**Unified section** containing:
1. Status label with rainbow animation and dancing dots (when processing)
2. Skeleton content below status (when processing)
3. Unsaved events list (when events exist)
4. Save button and label (when events exist and not processing)

#### Implementation Plan
1. Add `showHeader={false}` prop to BatchEventList in UnsavedEventsSection to hide "Made some events"
2. Move ProcessingSection content into UnsavedEventsSection as the first child
3. Pass processing-related props (imageProcessingStatuses, urlProcessingStatus, isProcessing) to UnsavedEventsSection
4. Update page.tsx to combine both sections into one UnsavedEventsSection call
5. **Disable save button while processing** to prevent race conditions (edge case handling deferred to Task 113)
