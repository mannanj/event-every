### Task 181: Search/filter on Recent summons
- [x] Fuzzy search box pinned in the modal header (ordered-subsequence match, case-insensitive, no dependency)
- [x] Matches across input text + generated summary + attached file names
- [x] Day-grouping recomputed from the filtered results; empty days drop out
- [x] No-results state; search resets when the modal closes
- [x] Only rendered when there is history
- [x] E2E: filters + clears back to all; matches by summary; no-results state
- Location: `src/components/InputHistoryModal.tsx`, `e2e/draft-and-history.spec.ts`

[Task-181]
