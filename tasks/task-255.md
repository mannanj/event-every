### Task 255: Pin Jev 1.13 before jev-latest moves to 1.14
- [x] `src/server/typesafe/client.ts` sends `jev-1.13.0` instead of `jev-latest`. TypeSafe moves the
  alias to 1.14 on 2026-10-21; triage and verification thresholds were tuned on 1.13, so the alias
  would change prod answers with no code change.
- [x] `scripts/typesafe/client.ts` uses the same pin, overridable with `TYPESAFE_MODEL` so the eval can
  compare releases (Task 256).
- [x] Triage test asserts the pinned id.
- Location: `src/server/typesafe/client.ts`, `scripts/typesafe/client.ts`, `src/server/typesafe/__tests__/triage.test.ts`
