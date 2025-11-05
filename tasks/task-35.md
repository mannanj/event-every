### Task 35: Duplicate Detection - Event Merging Service

- [ ] Create `src/services/eventMerger.ts`
- [ ] Implement `mergeEvents()` function with LLM-guided logic
- [ ] Implement field-level merge strategies (title, dates, location, description)
- [ ] Add conflict detection and resolution logic
- [ ] Handle edge cases (all-day vs timed events, timezone differences)
- [ ] Write unit tests for merge scenarios

**Location**: `src/services/eventMerger.ts`

**Details**: Intelligent event merging using LLM. Features:
- Smart field merging (choose most descriptive title, precise dates, complete location)
- Conflict detection when fields differ significantly
- LLM-generated explanation of merge decisions
- Preserves important details from both events
- Returns merged event with conflict warnings
