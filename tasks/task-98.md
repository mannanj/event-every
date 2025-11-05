### Task 98: Redesign Smart Input - Floating Controls & Internal Content Layout

- [x] Remove "Add images, text or both" header (rely on placeholder + attach icon)
- [x] Expand input to fill container with only 5px margin/padding on all sides
- [x] Move Transform button to floating position at bottom-right inside input
- [x] Move attach icon to top-right inside input
- [x] Reposition URL pills to bottom of input, single scrollable row up to Transform button
- [x] On small devices, allow pills to take up two rows with horizontal scroll
- [x] Move images/attachments to top row inside input, scrollable up to attach icon
- [x] Shrink text area vertically when images present (no text below images)
- [x] Ensure input container never resizes, maintains full height

**Location**: `src/components/SmartInput.tsx`, `src/app/page.tsx`

**Design Requirements**:
- Input takes full container area (5px margin)
- Floating controls: Transform (bottom-right), Attach (top-right)
- Content layout inside input:
  - Top row: Images/attachments (scrollable, up to attach icon)
  - Middle: Text area (shrinks when images present)
  - Bottom: URL pills (scrollable row up to transform button)
- Pills: single row on desktop, 2 rows on mobile, horizontal scroll
- Input never changes size
