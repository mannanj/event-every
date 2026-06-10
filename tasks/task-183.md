### Task 183: Community budget gate for LLM routes
- [x] Track exact per-request LLM cost (OpenRouter `usage.cost`) in Upstash Redis under a per-UTC-day key, capped by `DAILY_BUDGET_USD` (default $5)
- [x] Admin detection via the existing pattern-lock cookie: admins use `OPENROUTER_API_KEY` and bypass the budget; anonymous traffic uses `OPENROUTER_COMMUNITY_KEY` (fallback: same key) and is budget-gated
- [x] All four LLM routes (`/api/parse`, `/api/summarize`, `/api/resolve-timezone`, `/api/detect-urls`) pre-check the budget and return 402 `{ code: 'community_limit', resetAt }` when spent; upstream OpenRouter 402s map to the same shape
- [x] `GET /api/usage` exposes `{ limitUsd, spentUsd, remainingUsd, exhausted, resetAt, isAdmin }`
- [x] Client emits a `summon:community-limit` window event on any community-limit 402 (fetch sites + SSE error chunks)
- Location: `src/lib/budget.ts`, `src/lib/llm.ts`, `src/utils/communityLimit.ts`, `src/app/api/usage/route.ts`, `src/app/api/{parse,summarize,resolve-timezone,detect-urls}/route.ts`, `src/services/{parser,summarizer,urlDetector}.ts`, `src/app/page.tsx`
