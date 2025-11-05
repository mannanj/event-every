### Task 44: Conversational Event Editing
- [ ] Add chat/text input interface for conversational edits
- [ ] Implement natural language parsing for event updates
- [ ] Support commands like "change time to 3pm", "move to next Tuesday", "add location: cafe"
- [ ] Update event fields based on conversational input
- [ ] Show confirmation of changes made
- [ ] Optional: Add speech-to-text for voice commands

**Location:** `src/components/`, `src/services/parser.ts`

**Details:**
- Conversational interface to edit events by typing/talking
- Examples:
  - "Make it 2 hours earlier"
  - "Change location to Central Park"
  - "Move to Friday at 5pm"
  - "Add 'bring laptop' to description"
- Use LLM to parse intent and extract field updates
- Works on newly created events and history
- Minimal black & white UI (chat bubble or input field)
- Voice input optional (browser Speech Recognition API)
