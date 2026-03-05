### Task 167: Multi-Step AI Pipeline with Timezone Resolution & Frontend Progressive Loading

- [x] Update types: Add rawStartDate, rawEndDate, rawTimezone, timezoneStatus, timezoneSource to CalendarEvent
- [x] Simplify LLM prompt to extract-only (no TZ conversion), switch default model to DeepSeek v3.2
- [x] Create timezoneResolver service for programmatic + LLM timezone resolution
- [x] Create /api/resolve-timezone endpoint for async LLM timezone resolution
- [x] Create timeConversion utilities (convertRawToDate, formatTimeInTimezone, getTimezoneAbbreviation)
- [x] Fix convertParsedToCalendarEvent to use raw dates + timezone resolution pipeline
- [x] Add async timezone resolution flow with user-touched tracking and suggestion pills
- [x] Update InlineEventEditor with TZ dropdown, spinner, LLM suggestion pill
- [x] Update BatchEventList with TZ abbreviation and spinner in compact view
- [x] Update EventConfirmation with TZ in time display
- [x] Fix ICS export to use UTC (getUTCHours/etc), remove TZID post-processing hack
- [x] Wire TZ suggestion props through UnsavedEventsSection to BatchEventList
- Location: `src/types/event.ts`, `src/services/parser.ts`, `src/services/timezoneResolver.ts`, `src/app/api/resolve-timezone/route.ts`, `src/utils/timeConversion.ts`, `src/app/page.tsx`, `src/components/InlineEventEditor.tsx`, `src/components/BatchEventList.tsx`, `src/components/EventConfirmation.tsx`, `src/services/exporter.ts`, `src/components/UnsavedEventsSection.tsx`
