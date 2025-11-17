### Task 154: Context-Aware Event Parsing with Client DateTime & Timezone

**Objective**: Enhance LLM event parsing with client-side context (current date/time, timezone, browser info) to enable accurate interpretation of relative date expressions like "tomorrow at 8pm", "7 days from now", "yesterday", etc.

**Current State Analysis**:
- Frontend: `src/app/page.tsx` calls `/api/parse` endpoint with `text`, `imageBase64`, `imageMimeType`, and `batch` flag
- API Route: `src/app/api/parse/route.ts` receives request and passes to parser service
- Parser Service: `src/services/parser.ts` uses Anthropic Claude API with prompts defined in:
  - `EVENT_PARSING_PROMPT` (single event)
  - `BATCH_EVENT_PARSING_PROMPT` (multiple events)
- Functions: `parseEvent()` and `parseEventsBatch()` construct messages for Claude API
- **Existing Timezone Infrastructure**: `src/utils/timezone.ts` already has `getBrowserTimezone()` utility
  - Returns IANA timezone using `Intl.DateTimeFormat().resolvedOptions().timeZone`
  - Includes timezone abbreviation to IANA mapping (PST, EST, etc.)
  - Has `normalizeTimezone()` and `isValidIANATimezone()` functions
- **Current Limitation**: No mechanism to pass user's local date/time or timezone context to LLM
- **NO existing user context capture**: Frontend does NOT currently send browser/user data to backend

**Use Cases**:
1. **Relative Dates**: "Create event tomorrow at 8pm" → LLM needs to know today's date
2. **Days Offset**: "Meeting 7 days from now" → Calculate from current date
3. **Past References**: "Event yesterday at noon" → Calculate from current date
4. **Timezone Context**: "3pm EST meeting" when user is in PST → Better timezone handling
5. **Browser Context**: User's preferred date format, locale settings

**Subtasks**:

- [x] **Frontend: Capture Client Context**
  - Add utility function `getClientContext()` in new file `src/utils/clientContext.ts`
  - **REUSE existing `getBrowserTimezone()` from `src/utils/timezone.ts`** (do NOT duplicate)
  - Capture: ISO timestamp, timezone (via `getBrowserTimezone()`), timezone offset, browser locale
  - Create interface `ClientContext` in `src/types/event.ts`
  - Include fields: `currentDateTime`, `timezone`, `timezoneOffset`, `locale`
  - Do NOT include userAgent (privacy concern, not needed for LLM)

- [x] **Frontend: Pass Context to API**
  - Modify API calls in `src/app/page.tsx` to include `clientContext` in request body
  - Update both single and batch parsing calls

- [x] **API Route: Accept Client Context**
  - Update `src/app/api/parse/route.ts` to receive `clientContext` from request body
  - Pass context through to parser service functions

- [x] **Parser Service: Integrate Context into Prompts**
  - Modify `parseEvent()` in `src/services/parser.ts` to accept optional `clientContext`
  - Modify `parseEventsBatch()` to accept optional `clientContext`
  - Update `EVENT_PARSING_PROMPT` to include context information when available
  - Update `BATCH_EVENT_PARSING_PROMPT` to include context information when available
  - Format context as: "Current context: Date/Time: [ISO], Timezone: [IANA], Locale: [locale]"

- [x] **TypeScript Interfaces**
  - Define `ClientContext` interface in `src/types/event.ts` with fields:
    - `currentDateTime: string` (ISO 8601 format from `new Date().toISOString()`)
    - `timezone: string` (IANA identifier from `getBrowserTimezone()`, e.g., "America/New_York")
    - `timezoneOffset: number` (minutes from UTC, from `new Date().getTimezoneOffset()`)
    - `locale: string` (from `navigator.language`, e.g., "en-US")
  - Update `ParseEventInput` interface in `src/services/parser.ts` to include optional `clientContext?: ClientContext`

- [x] **Testing**
  - Test with relative date expressions: "tomorrow", "next week", "yesterday"
  - Test with time-offset expressions: "3 days from now", "2 hours ago"
  - Test timezone-aware parsing across different client timezones
  - Verify backwards compatibility (works without context)

- [x] **Documentation**
  - Update inline comments explaining context usage
  - Document context structure in code comments

**Technical Notes**:
- **REUSE existing utilities**: Use `getBrowserTimezone()` from `src/utils/timezone.ts` (do NOT duplicate)
- Use `new Date().toISOString()` for current datetime
- Use `new Date().getTimezoneOffset()` for offset in minutes (negative for UTC+, positive for UTC-)
- Use `navigator.language` for browser locale
- Context should be optional - maintain backwards compatibility (LLM works without it)
- LLM should use context to resolve relative dates to absolute ISO 8601 dates
- **Privacy**: Do NOT capture userAgent or any personally identifiable information

**Location**:
- `src/types/event.ts` (ClientContext interface)
- `src/utils/clientContext.ts` (NEW - context capture utility)
- `src/utils/timezone.ts` (EXISTING - reuse getBrowserTimezone)
- `src/app/page.tsx` (frontend - call getClientContext and pass to API)
- `src/app/api/parse/route.ts` (API endpoint - receive and forward context)
- `src/services/parser.ts` (LLM integration - add context to prompts)

**Priority**: High - Significantly improves UX for natural language event creation
