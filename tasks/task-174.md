### Task 174: Recent-summons polish (padding, conditional icon, rename)
- [x] Textarea gains right padding when the history icon is present, so first-line text no longer overlaps it
- [x] History icon hidden until there is history (the empty-state modal is now unreachable by design — kept only as a harmless fallback)
- [x] Renamed "Input history" → "Recent summons" (header + aria) and softened the empty-state copy
- [x] Tests: added the hidden-until-history check; folded the prod modal open/close into the history test
- [x] Local suite: 23/23 passing
- Location: `src/components/SmartInput.tsx`, `src/app/page.tsx`, `src/components/InputHistoryModal.tsx`, `e2e/`

[Task-174]
