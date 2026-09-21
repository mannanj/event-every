### Task 242: The checkbox holds the title line, and everything sits on one gap
- [x] Centre the checkbox on the title rather than the title-plus-date block, so it stops shifting when the card opens
- [x] Raise the title to 18px
- [x] Tighten the left gutter: card padding 12 to 8, checkbox-to-title gap 16 to 12, body indent tracking the title
- [x] Put header, fields and files all on the same ~10px gap, replacing the doubled step the files had
- [x] Realign the undo row to the moved columns
- [x] Pin it: checkbox centred and fixed across states, title size, one rhythm across every element
- Location: `src/components/event-card/EventCard.tsx`, `src/components/EventFields.tsx`, `src/components/event-card/UndoRemovalRow.tsx`, `e2e/card-header-alignment.spec.ts`, `e2e/review-attachments.spec.ts`
