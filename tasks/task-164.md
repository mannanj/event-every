### Task 164: Fix All-Day Event Detection & UI Display

#### Issues:
1. **Backend**: LLM not correctly parsing "would you import these events as single day events" instruction
2. **Frontend**: No visual indicator showing event is all-day in confirmation UI
3. **Frontend**: Event times showing in UI even when event is marked as all-day
4. **Backend**: Prompt needs stronger emphasis on detecting all-day event requests

#### Reference:
- Test image: Johns Hopkins Agentic AI Schedule (Certificate Program in Agentic AI - Learning Schedule December 2025 Cohort)
- Reference images to save in: `tasks/task-164-images/`
  - `johns-hopkins-schedule.png` - Input: Johns Hopkins schedule table with course dates
  - `current-broken-output.png` - Current incorrect output showing times instead of all-day
- Test command: "Would you import these events as single day events?"
- Expected: All events should have `allDay: true` and display without times
- Actual: Events show times like "12:00 AM - 12:00 AM" instead of "All Day"

#### Current Behavior:
- Events are processed but `allDay` field remains `false`
- UI shows times even though they should be all-day events
- No visual toggle or indicator in EventConfirmation component

#### Subtasks:

**Backend (Parser):**
- [ ] Investigate current LLM response when "single day" instruction is given
- [ ] Update EVENT_PARSING_PROMPT to better emphasize all-day detection keywords
- [ ] Update BATCH_EVENT_PARSING_PROMPT to better emphasize all-day detection keywords
- [ ] Add specific examples of all-day keywords: "single day", "all day", "all-day", "full day"
- [ ] Test with Johns Hopkins schedule + "would you import these events as single day events"
- [ ] Verify parsed events have `allDay: true` in debug logs

**Frontend (UI):**
- [ ] Add all-day indicator in EventConfirmation component
- [ ] Show "All Day" badge/label instead of times when event.allDay is true
- [ ] Add toggle in EventEditor to switch between timed/all-day
- [ ] Update date/time picker visibility based on allDay flag
- [ ] Ensure allDay events show date only (no time pickers)
- [ ] Visual distinction between all-day and timed events in history

**Testing:**
- [ ] Test: Upload Johns Hopkins image + "would you import these events as single day events"
- [ ] Verify: All events parsed with `allDay: true`
- [ ] Verify: UI shows "All Day" instead of times
- [ ] Verify: Export to ICS uses DATE format (not DATETIME)
- [ ] Verify: Import to Mac Calendar shows in all-day row
- [ ] Test: Toggle between all-day and timed in editor
- [ ] Test: Manual entry as all-day event

#### Technical Details:

**Prompt Enhancement Strategy:**
```typescript
// Add to both EVENT_PARSING_PROMPT and BATCH_EVENT_PARSING_PROMPT
Keywords that indicate all-day events:
- "single day" / "single-day"
- "all day" / "all-day"
- "full day" / "full-day"
- "whole day"
- User explicitly says "import as all-day" or similar

When these keywords are present in the user's instruction, set allDay to true for ALL events,
regardless of whether times are present in the source material.
```

**UI Component Changes:**

EventConfirmation.tsx:
```tsx
{event.allDay ? (
  <div className="flex items-center gap-2">
    <span className="text-sm font-medium">All Day</span>
    <span className="text-sm text-gray-600">
      {format(event.startDate, 'MMM d, yyyy')}
    </span>
  </div>
) : (
  <div className="flex items-center gap-2">
    <Clock className="w-4 h-4" />
    <span>
      {format(event.startDate, 'MMM d, yyyy h:mm a')} -
      {format(event.endDate, 'h:mm a')}
    </span>
  </div>
)}
```

EventEditor.tsx:
```tsx
<div className="flex items-center gap-2">
  <input
    type="checkbox"
    id="allDay"
    checked={formData.allDay}
    onChange={(e) => handleChange('allDay', e.target.checked)}
  />
  <label htmlFor="allDay">All-day event</label>
</div>

{!formData.allDay && (
  // Show time pickers only for timed events
)}
```

#### Debug Checklist:
1. Check server logs for `[DEBUG] Tool use input:` to see what LLM returns
2. Verify `allDay` field in parsed events
3. Confirm text instruction is being sent with image in API call
4. Test that prompt changes result in correct `allDay: true` responses

- Location: `src/services/parser.ts`, `src/components/EventConfirmation.tsx`, `src/components/EventEditor.tsx`
