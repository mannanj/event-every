### Task 231: The undo row reads as one line, not as a control bolted on

The row said "<name> removed" with an underlined black "Undo" beside it, so the
two halves looked like different kinds of thing sitting in the same strip.

Now the label reads "Removed <name>" and "Undo" is set exactly like it: same
size, same italic, same grey, no underline. The undo icon and the row's position
under the trash carry the affordance instead, and hover darkens it.

- [x] Label reads "Removed <name>"
- [x] "Undo" matches the label: 14px, italic, grey, no underline
- [x] Assert the shared style so the two cannot drift apart
- Location: `src/components/event-card/UndoRemovalRow.tsx`, `e2e/undo-row-alignment.spec.ts`
