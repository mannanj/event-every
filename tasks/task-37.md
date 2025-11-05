### Task 37: Duplicate Detection - Progress Indicator Component

- [ ] Create `src/components/MergeProgressIndicator.tsx`
- [ ] Implement loading states with appropriate messages
- [ ] Add smooth transitions between states
- [ ] Style with black & white theme (spinner, text)
- [ ] Make component reusable for different detection stages
- [ ] Add accessibility (ARIA labels, screen reader support)

**Location**: `src/components/MergeProgressIndicator.tsx`

**Details**: Inline status indicator during duplicate detection. Shows:
- "Checking for duplicates..." (initial scan)
- "Analyzing event similarity..." (LLM processing)
- "Preparing merge preview..." (generating merged event)
- "Done!" (completion with checkmark, then fade out)
- Clean black & white spinner animation
- Non-blocking, overlays current UI
