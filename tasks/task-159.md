### Task 159: Fix Date Parsing Bug - "Tomorrow" Creates Event Two Days Later
- [x] Investigate timezone handling in LLM message context (parser.ts)
- [x] Debug date calculation logic for relative terms like "tomorrow"
- [x] Verify client datetime and timezone are correctly passed to backend
- [x] Test "tomorrow" event creation in Eastern timezone
- [x] Verify fix works across different timezones
- Location: `src/services/parser.ts`, `src/utils/clientContext.ts`

**Issue**: When creating an event "tomorrow at 8pm" on Sunday 8pm Eastern time, the event is created for Tuesday 8pm instead of Monday 8pm (two days later instead of one day later).

**Expected**: "Tomorrow" should create event for next day (Monday)
**Actual**: "Tomorrow" creates event for day after next (Tuesday)

**Root Cause**:
1. `currentDateTime` was sent in UTC format, which caused date boundary confusion (Sunday 10:32pm EST = Monday 3:32am UTC)
2. `timezoneOffset` had wrong sign convention (JavaScript's `getTimezoneOffset()` returns opposite sign)
3. Context message format was ambiguous for the LLM

**Solution**:
1. Convert `currentDateTime` to local timezone before sending (removed UTC conversion)
2. Flip sign of `timezoneOffset` to match standard convention (-300 for UTC-5)
3. Format context as `UTC±N` (e.g., "America/New_York (UTC-5)")
4. Added debug logging for troubleshooting

**Files Modified**:
- `src/utils/clientContext.ts` - Fixed local datetime calculation and offset sign
- `src/services/parser.ts` - Improved context formatting with UTC±N notation and debug logs
