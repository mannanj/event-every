### Task 162: Fix All-Day Event Export & Implement Claude JSON Tool Use

#### Issues:
1. All-day events are exported with times (00:00:00) instead of proper DATE-only format in ICS
2. Parser fails when user asks to "import as all-day events" due to unreliable JSON extraction
3. Not using Claude's structured JSON output (tool use) - relying on regex to extract JSON

#### Context:
- CalendarEvent has `allDay: boolean` field but exporter ignores it
- Current parser uses regex `jsonMatch = responseText.match(/\{[\s\S]*\}/);` instead of JSON mode
- Should use Claude's tool use feature for guaranteed valid JSON responses

#### Subtasks:
- [x] Implement Claude JSON tool use in parser.ts for reliable JSON extraction
- [x] Add `allDay` field to ParsedEvent schema
- [x] Update EVENT_PARSING_PROMPT to instruct LLM about allDay field
- [x] Update BATCH_EVENT_PARSING_PROMPT to instruct LLM about allDay field
- [x] Modify exportToICS() to handle allDay events (DATE format, no TZID)
- [x] Modify exportMultipleToICS() to handle allDay events per event
- [x] Update dateToArray() to support 3-element array for DATE-only
- [x] Update page.tsx to pass through allDay flag from parsed events
- [ ] Test single all-day event export to Mac Calendar
- [ ] Test batch export with mixed timed/all-day events
- [ ] Test Johns Hopkins schedule import as all-day events

#### Technical Details:

**ICS Format for All-Day Events:**
```
DTSTART;VALUE=DATE:20251122
DTEND;VALUE=DATE:20251123
```

**Not:**
```
DTSTART;TZID=America/New_York:20251122T000000
DTEND;TZID=America/New_York:20251123T000000
```

**Claude JSON Tool Use Pattern:**
```typescript
const message = await anthropic.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 4096,
  tools: [{
    name: "extract_events",
    description: "Extract calendar event details",
    input_schema: {
      type: "object",
      properties: {
        events: { type: "array", ... },
        totalCount: { type: "number" },
        confidence: { type: "number" }
      }
    }
  }],
  tool_choice: { type: "tool", name: "extract_events" }
});
```

- Location: `src/services/parser.ts`, `src/services/exporter.ts`, `src/types/event.ts`
