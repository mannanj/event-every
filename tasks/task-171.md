### Task 171: Wire draft persistence + input history into the UI
- [x] SmartInput: restore draft on mount, debounced draft save, clear draft on transform
- [x] SmartInput: history icon (floating, left of the attach icon), `getDraft`/`loadInput` ref API, data-testids
- [x] page.tsx: save input to history on Transform; render `InputHistoryModal`
- [x] page.tsx: apply-with-unsaved guard — auto-save current draft into today's history, then load the selected entry
- Location: `src/components/SmartInput.tsx`, `src/app/page.tsx`

[Task-171]
