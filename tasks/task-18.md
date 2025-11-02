### Task 18: API & Parser for Batch Event Processing
- [x] Update `ParsedEvent` type to support batch results with event arrays
- [x] Modify Claude prompt in parser.ts to detect multiple events (max 50)
- [x] Implement streaming response to return events progressively (3 at a time)
- [x] Update /api/parse route to handle async batch parsing
- [x] Add batch count detection and validation
- [x] Add error handling for batch limits and malformed responses
- [x] Test with multi-event images (conference schedules, calendars)
- Location: `src/services/parser.ts`, `src/app/api/parse/route.ts`, `src/types/event.ts`

**Priority**: High Impact, High Effort (8-10 hours)
**Benefits**: Progressive event loading, cost control, better UX for large batches
**Implementation Notes**:
- Use Claude streaming API to get events as they're parsed
- Process events in chunks of 3 to balance cost and speed
- Hard limit of 50 events per batch
- Return events asynchronously so UI can update in real-time
