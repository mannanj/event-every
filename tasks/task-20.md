### Task 20: Batch Selection & Export
- [ ] Add checkbox selection system to BatchEventList
- [ ] Implement "Select All" / "Deselect All" functionality
- [ ] Create bulk export to single .ics file with multiple events
- [ ] Add selective export (only selected events)
- [ ] Implement bulk edit mode for common fields (location, description)
- [ ] Update exporter.ts to generate multi-event .ics files
- [ ] Add batch event validation before export
- [ ] Update history to handle batch saves (individual or grouped)
- Location: `src/components/BatchEventList.tsx`, `src/services/exporter.ts`, `src/hooks/useHistory.ts`

**Priority**: High Impact, Medium Effort (5-7 hours)
**Benefits**: Efficient bulk operations, flexible export options
**Dependencies**: Requires Task 19 (Batch UI) to be completed first
