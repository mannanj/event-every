### Task 34: Duplicate Detection - LLM Similarity Service

- [ ] Create `src/services/duplicateDetection.ts`
- [ ] Implement `detectDuplicates()` function with LLM integration
- [ ] Implement `scoreSimilarity()` helper for individual comparisons
- [ ] Add fallback logic for when LLM is unavailable (basic string matching)
- [ ] Add caching layer for duplicate detection results
- [ ] Write unit tests for detection logic

**Location**: `src/services/duplicateDetection.ts`

**Details**: Core LLM-powered duplicate detection engine. Uses structured prompts to:
- Compare event pairs for similarity (title, date, location, description)
- Return similarity score (0-100) with confidence level
- Explain match reasons in user-friendly language
- Only check events within reasonable time window (±2 weeks)
- Cache results to avoid redundant LLM calls
