### Task 159: Fix Date Parsing Bug - "Tomorrow" Creates Event Two Days Later
- [ ] Investigate timezone handling in LLM message context (parser.ts)
- [ ] Debug date calculation logic for relative terms like "tomorrow"
- [ ] Verify client datetime and timezone are correctly passed to backend
- [ ] Test "tomorrow" event creation in Eastern timezone
- [ ] Verify fix works across different timezones
- Location: `src/services/parser.ts`, `src/app/api/parse/route.ts`

**Issue**: When creating an event "tomorrow at 8pm" on Sunday 8pm Eastern time, the event is created for Tuesday 8pm instead of Monday 8pm (two days later instead of one day later).

**Expected**: "Tomorrow" should create event for next day (Monday)
**Actual**: "Tomorrow" creates event for day after next (Tuesday)

**Likely Causes**:
- Timezone offset calculation error in LLM context message
- UTC conversion issue when passing client datetime
- Date boundary handling when parsing relative terms
