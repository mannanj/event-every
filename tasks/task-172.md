### Task 172: Cancel in-flight parse jobs (real abort)
- [x] `AbortController` threaded through both live `/api/parse` paths (image loop + text)
- [x] `handleCancelBatch` aborts the request and clears all processing UI + partial events
- [x] `AbortError` treated as a silent user-cancel (no error toast)
- [x] Absolutely-positioned ✕ at the top-right of the "Reading the tea leaves" card
- Location: `src/app/page.tsx`, `src/components/UnsavedEventsSection.tsx`

[Task-172]
