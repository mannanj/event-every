### Task 20: Batch Selection & Export
- [x] Add checkbox selection system to BatchEventList
- [x] Implement "Select All" / "Deselect All" functionality
- [x] Create bulk export to single .ics file with multiple events
- [x] Add selective export (only selected events)
- [x] Implement bulk edit mode for common fields (location, description)
- [x] Update exporter.ts to generate multi-event .ics files
- [x] Add batch event validation before export
- [x] Update history to handle batch saves (individual or grouped)
- Location: `src/components/BatchEventList.tsx`, `src/services/exporter.ts`, `src/hooks/useHistory.ts`

**Priority**: High Impact, Medium Effort (5-7 hours)
**Benefits**: Efficient bulk operations, flexible export options
**Dependencies**: Requires Task 19 (Batch UI) to be completed first
