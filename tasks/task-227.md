### Task 227: Recent keeps one row per input

Running the same input again appended another identical row, so a handful of
repeats buried everything older under copies of one paste.

A re-run now moves the row it already has up to the current moment instead of
adding a second. Anything the user changed is a different input and gets its own
row, so an edit reads as a new thing rather than an overwrite.

- [x] `inputHistoryIdentity`: text plus each file's kind, name and size, separated so neither can impersonate the other
- [x] `addHistoryEntry` reuses the matching row and returns the id that survived
- [x] `saveInputToHistory` returns that surviving id, so the summary lands on the row that exists
- [x] The reused row keeps its summary, which still describes the same input
- Location: `src/utils/inputIdentity.ts`, `src/services/inputStorage.ts`, `src/hooks/useInputHistory.ts`, `src/app/page.tsx`

11 unit tests on the identity rules, 3 e2e across chromium and webkit: a repeat
holds at one row, a repeat returns above inputs run since, and an edit adds a row.
