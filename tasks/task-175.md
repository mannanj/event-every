### Task 175: Don't duplicate a loaded entry in Recent summons
- [x] Track the signature of the entry loaded from Recent summons (`loadedSigRef`)
- [x] On Transform, skip the history-save when the input is byte-identical to the loaded entry; save only if new or modified
- [x] Apply-while-unsaved guard respects the same check (re-loading an untouched entry won't duplicate it)
- [x] Tests: load + transform-unmodified → no dup; load + modify + transform → new entry
- [x] Local suite: 25/25
- Location: `src/app/page.tsx`, `e2e/draft-and-history.spec.ts`

Root cause: NOT the IndexedDB draft sync (separate `draft` store, read-only against history) — it was `handleSmartInputSubmit` calling `saveInputToHistory` on every Transform, including for an unmodified entry loaded from history.

[Task-175]
