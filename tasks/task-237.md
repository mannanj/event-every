### Task 237: One fullscreen viewer everywhere, and a title that holds its place
- [x] Portal ImageModal to document.body so the smart input's [container-type:size] wrapper stops pinning it inside the input
- [x] Confirm the fullscreen viewer is one shared component, not a second copy
- [x] Keep the saved card's title bold and in the same seat whether the card is open or shut
- [x] Move the saved card's fields into the expanded body with hideTitle, matching the unsaved cards
- [x] Cover it: viewport-filling from both entry points, portal parent, title alignment
- Location: `src/components/ImageModal.tsx`, `src/app/page.tsx`, `e2e/review-attachments.spec.ts`
