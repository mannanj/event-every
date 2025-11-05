### Task 66: Event Q&A via Chat
- [ ] Create chat service for LLM integration
- [ ] Pass full event context (title, dates, location, description, attachments) to LLM
- [ ] Implement message history in chat
- [ ] Add loading states for AI responses
- [ ] Handle error cases gracefully
- [ ] (Future) Add web search capability for external links
- [ ] (Future) Browse and analyze links in event description/attachments
- Location: `src/components/ChatModal.tsx`, `src/services/chat.ts`

**Dependencies:** Task 65

**Notes:**
- Reuse existing LLM integration from parser service
- Event context should include attachment metadata
- Future: RAG-style search over event attachments
