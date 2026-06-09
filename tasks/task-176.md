### Task 176: Correct the Recent-summons save rule
- [x] Transform always records to history (re-saving a loaded entry is fine)
- [x] Merely loading an entry never creates a duplicate — only a change (or Transform) records
- [x] apply-while-unsaved guard still auto-saves the current input only when it was actually changed (`loadedSigRef`)
- [x] Test updated: load-alone (and re-load) → no dup; load + modify + transform → new entry
- Location: `src/app/page.tsx`, `e2e/draft-and-history.spec.ts`

Corrects Task 175, which had the rule backwards (it suppressed the Transform save). Per the user: load alone must not duplicate; transform re-save is acceptable; a save requires a change or a Transform.

[Task-176]
