### Task 212: TypeSafe server client and pre-scan triage route with a no-op fallback
- [x] Server-only TypeSafe client: key from Worker secret or process.env, timeout, null on any failure
- [x] Triage judgments and decision policy: has_event, shape, completeness, paragraph boundaries; skip / split / single
- [x] `/api/triage` route that always answers 200 and reports `available: false` whenever the scan must run as before
- [x] Client service with a deadline that resolves to null on any failure
- [x] Tests for splitting, questions, policy, fallback paths, and the route
- Location: `src/server/typesafe/`, `src/app/api/triage/`, `src/services/scanTriage.ts`
