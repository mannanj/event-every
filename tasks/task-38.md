### Task 38: Duplicate Detection - Modal Component

- [ ] Create `src/components/DuplicateDetectionModal.tsx`
- [ ] Implement side-by-side comparison view (original vs new event)
- [ ] Display similarity score and match reasons
- [ ] Show merged preview with field-by-field breakdown
- [ ] Add action buttons (Merge, Keep Both, Cancel)
- [ ] Handle multiple duplicates (if >1 match found)
- [ ] Add keyboard navigation (Esc to close, Tab navigation)
- [ ] Style with black & white theme, ensure mobile responsive

**Location**: `src/components/DuplicateDetectionModal.tsx`

**Details**: Interactive modal for reviewing and approving merges. Features:
- Clean side-by-side layout showing both events
- Visual diff highlighting differences
- Confidence indicator (High/Medium/Low with score)
- Merged preview section showing final result
- Clear action buttons with hover states
- Mobile-friendly responsive design
- Accessible keyboard shortcuts
