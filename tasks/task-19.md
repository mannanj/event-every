### Task 19: Batch Event UI Components
- [ ] Create BatchEventList component for displaying multiple events
- [ ] Add progressive loading indicators (show events as they arrive)
- [ ] Create event count indicator ("X events found, Y more processing...")
- [ ] Update page.tsx to handle batch state and async event additions
- [ ] Add expand/collapse functionality for individual event details
- [ ] Implement compact card view for batch display
- [ ] Add "Processing batch..." state with real-time count updates
- [ ] Update EventEditor to work with batch context
- Location: `src/components/BatchEventList.tsx`, `src/components/EventEditor.tsx`, `src/app/page.tsx`

**Priority**: High Impact, Medium Effort (6-8 hours)
**Benefits**: Real-time feedback, better visualization of multiple events
**Dependencies**: Requires Task 18 (API updates) to be completed first
