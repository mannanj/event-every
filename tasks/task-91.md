### Task 91: Consolidate Processing UI into Single Unified Section

- [x] Create unified Processing section component that shows all processing items (images and text) in one list
- [x] Update processing item display to show type [Image #1], [Text #1], etc. with current processing step
- [x] Add checkmark indicators for completed processing items in the Processing section
- [x] Remove bottom-right 'Processing Queue' popup component
- [x] Remove Cancel button from Processing section tray (keep only on individual items as future feature)
- [x] Implement logic to move processed items to Event History when Export is clicked
- [x] Rename 'Event History' section to 'Processed'
- [x] Clean up old processing UI components and states
- [x] Test consolidated processing UI with multiple images and text inputs

**Location**: `src/components/`, `src/app/page.tsx`

**Context**: Currently have multiple scattered processing UI elements (Processing 1 image section, Extracting events section, Processing Queue popup in bottom right). Need to consolidate into ONE single "Processing" section that shows all items being processed with their current step, displays checkmarks when complete, and integrates cleanly with the export flow.

**Design Goals**:
- Single Processing section showing all items (images/text) in unified list
- Each item shows format "[Image #1]" or "[Text #1]" with processing step
- Checkmarks for completed items
- No Cancel on tray level, only per-item (future feature)
- Items move to "Processed" section on Export
- Remove Processing Queue popup entirely
