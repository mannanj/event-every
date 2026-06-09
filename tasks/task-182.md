### Task 182: Per-card 2-3 word LLM summaries (Recent summons)
- [x] New `/api/summarize` route (mirrors the detect-urls pattern); model `mistralai/ministral-8b-2512` via `OPENROUTER_SUMMARY_MODEL`
- [x] Verified the bare `mistralai/ministral-8b` alias 404s ("No endpoints found") — only the dated id resolves; hardcoded the dated id as the default
- [x] Defensive cleaner: splits run-on PascalCase ("DinnerWithSam"), clamps to 2-3 Title-Case words; graceful 400 on empty/aborted body (no scary log)
- [x] Non-throwing client `summarizeInput` — a slow/failed summary never disrupts event extraction
- [x] Fired in parallel per transform, after that input's events resolve (image + text + calendar paths); exactly one "owner" handler per submit so mixed inputs don't double-fire
- [x] `summary` persisted on `InputHistoryEntry` (IndexedDB) via new `inputStorage.updateHistoryEntry` + `useInputHistory.setSummary`
- [x] Label absolutely positioned above the card thumbnails with reserved space (no overlap); shimmer while in flight (`pendingSummaryIds`)
- [x] E2E: label renders after transform; shimmer → resolves; existing specs also mock `/api/summarize` so no real (paid) API calls
- Location: `src/app/api/summarize/route.ts`, `src/services/summarizer.ts`, `src/services/inputStorage.ts`, `src/hooks/useInputHistory.ts`, `src/types/input.ts`, `src/app/page.tsx`, `src/components/InputHistoryModal.tsx`, `e2e/`

[Task-182]
