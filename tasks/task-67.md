### Task 67: Natural Language Event Editing
- [ ] Extend chat service to detect edit intents ("change title to...", "update date to...")
- [ ] Implement edit command parser
- [ ] Apply edits to event and save new version
- [ ] Show confirmation in chat ("Title updated to 'xyz'")
- [ ] Add undo capability in chat
- [ ] (Future) Support recurring event creation
- [ ] (Future) Support complex date operations ("every Tuesday", "skip next Monday")
- Location: `src/services/chat.ts`, `src/services/storage.ts`

**Dependencies:** Task 66

**Notes:**
- LLM should extract structured edit commands
- Each edit creates new version (see Task 68 for versioning)
- Keep edits reversible
