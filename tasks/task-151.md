### Task 151: Integrate Timezone Parsing and Detection
- [x] Update parser to extract timezone from event data (images, text, ICS)
- [x] Modify ICS exporter to set TZID correctly from parsed timezone
- [x] Implement browser timezone fallback when no timezone in event data
- [x] Add timezone validation and conversion utilities
- [x] Update Event interface to include timezone field
- [x] Test with various timezone formats (PST, EST, UTC offsets, IANA codes)
- Location: `src/services/parser.ts`, `src/services/exporter.ts`, `src/types/event.ts`, `src/utils/timezone.ts`
