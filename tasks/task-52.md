### Task 52: Batch Link Processing Infrastructure
- [ ] Parse multiple URLs from text input (detect and extract links)
- [ ] Implement background processing queue for multiple links
- [ ] Create link processor service with queue management
- [ ] Handle individual link failures gracefully (skip and continue)
- [ ] Add queue status indicator (X of Y processed)
- [ ] Show processing progress for batch imports
- [ ] Integrate with text input component
- [ ] Store processing results for grouped display
- Location: `src/components/TextInput.tsx`, `src/services/linkProcessor.ts`, `src/hooks/useBatchProcessor.ts`

**Notes:**
- Parse any number of URLs from text input
- Process links in background queue
- Extensible for multiple platforms (Meetup, Luma, Eventbrite, etc.)
