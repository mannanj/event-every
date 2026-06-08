### Task 169: Browser-persistence foundation (IndexedDB)
- [x] Input draft + input history types (`src/types/input.ts`)
- [x] Hand-rolled IndexedDB wrapper storing `File` objects directly; draft + history stores; 200-entry cap, fails gracefully (`src/services/inputStorage.ts`)
- [x] `useInputHistory` hook — load / add / refresh (`src/hooks/useInputHistory.ts`)
- Location: `src/types/input.ts`, `src/services/inputStorage.ts`, `src/hooks/useInputHistory.ts`

IndexedDB (not localStorage) because inputs include multi-MB image files that exceed localStorage's ~5MB cap; IDB stores File/Blob via structured clone, no base64 round-trip. Separate from the existing `event_every_history` (saved calendar events).

[Task-169]
