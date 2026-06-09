### Task 178: Fix blank image / empty `<img src="">` for stored images
- [x] `applyStoredFiles` now renders restored image blobs via `URL.createObjectURL` (synchronous + robust) instead of `FileReader.readAsDataURL`, which can fire `onerror` on an IndexedDB-restored File and leave an empty preview → `<img src="">` (Next.js console error + blank image on refresh / history-load)
- [x] Object URLs tracked + revoked (on next load, on clear, on unmount)
- [x] Defensive `src={preview || undefined}` on the input chips + ImageModal; try/catch around the history-modal thumbnail URLs
- [x] Tests strengthened: image-survives-reload and image-loaded-from-history now assert a valid non-empty `src` (`/^(blob:|data:)/`) — the old test only checked visibility, which an empty-src img passes (why this slipped through). Local 26/26.
- Location: `src/components/SmartInput.tsx`, `src/components/ImageModal.tsx`, `src/components/InputHistoryModal.tsx`, `e2e/draft-and-history.spec.ts`

[Task-178]
