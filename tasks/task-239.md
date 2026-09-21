### Task 239: Click-to-edit targets are sized to their text, with grace
- [x] Audit every click-to-edit surface: 7 inline EditableFields, the card title, the saved title
- [x] Confirm inline fields already size to their text; block mode is unused, so nothing else is full-width
- [x] Add 4px of grace on every edge, cancelled by negative margin so no text moves
- [x] Leave the card title's horizontal box alone - the undo row is pinned to that column
- [x] Cover it: grace present, nothing overlaps another control, text unmoved, clicking the padding edits
- Location: `src/components/EditableField.tsx`, `src/components/event-card/EventCard.tsx`, `src/app/page.tsx`, `e2e/editable-hitbox.spec.ts`
