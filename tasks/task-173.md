### Task 173: E2E tests (local feature suite + prod functional suite)
- [x] Shared helpers — auth/url/parse mocks + SSE builder (`e2e/helpers.ts`)
- [x] Local feature spec: draft reload (text + image), save-on-transform, apply-loads-input, apply-while-unsaved auto-save, day-grouping, cancel-aborts (`e2e/draft-and-history.spec.ts`)
- [x] Fixed the existing spec's auth bypass — mock `/api/auth/check` (the old localStorage key was a no-op, so the suite had been hanging at the pattern lock) (`e2e/event-extraction.spec.ts`)
- [x] Prod functional spec — real auth via gitignored `TEST_AUTH_PATTERN`, real parse, rate-limit tolerant (`e2e/prod.spec.ts`)
- [x] `playwright.config` split (local vs `E2E_TARGET=prod`) + dotenv; `test:e2e:prod` script; artifacts gitignored
- [x] **Local suite: 22/22 passing**
- Location: `e2e/`, `playwright.config.ts`, `package.json`, `.gitignore`, `.env.example`

[Task-173]
