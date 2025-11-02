### Task 13: Batch Event Processing
- [ ] Update parser to detect and extract multiple events from single image
- [ ] Modify Claude prompt to return array of events instead of single event
- [ ] Update EventConfirmation to handle multiple events (list view)
- [ ] Add bulk export functionality (single .ics with multiple events)
- [ ] Add individual event selection for editing
- [ ] Update UI to show "X events found" indicator
- [ ] Test with conference schedules, monthly calendars, event flyers
- Location: `src/services/parser.ts`, `src/components/EventConfirmation.tsx`, `src/services/exporter.ts`

**Priority**: High Impact, Medium Effort (6-8 hours)
**Benefits**: Handle complex scenarios like conference programs, monthly calendars
