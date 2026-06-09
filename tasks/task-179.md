### Task 179: Scope Recent-summons modal scroll (no chaining to the page)
- [x] `overscroll-behavior: contain` on the modal's scroll container — scrolling to the top/bottom of the modal no longer chains to the page below
- [x] Background page scroll locked (`document.body` overflow hidden) while the modal is open, restored on close
- [x] Test: body scroll is locked while the modal is open and restored after close
- Location: `src/components/InputHistoryModal.tsx`, `e2e/draft-and-history.spec.ts`

[Task-179]
