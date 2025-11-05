### Task 36: Duplicate Detection - React Hook

- [ ] Create `src/hooks/useDuplicateDetection.ts`
- [ ] Implement state management for detection flow
- [ ] Add `checkDuplicates()` function
- [ ] Add `mergeDuplicates()` function
- [ ] Add `keepBothEvents()` function
- [ ] Handle loading states and error handling

**Location**: `src/hooks/useDuplicateDetection.ts`

**Details**: React hook to orchestrate duplicate detection workflow. Provides:
- `isDetecting`: Loading state during LLM analysis
- `duplicates`: Array of detected duplicate matches
- `showModal`: Boolean to trigger duplicate review UI
- `checkDuplicates()`: Trigger detection for new event
- `mergeDuplicates()`: Execute merge and save
- `keepBothEvents()`: Save as separate events
