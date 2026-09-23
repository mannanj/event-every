### Task 250: A scan through an assistant is charged to the person, not to the Worker
- [x] Found: /api/mcp/scan and the photo handoff reach /api/scan over HTTP with no session, so the app saw only the Worker's own address. Every assistant shared one 20-a-day cap, and an admin was charged to the shared budget
- [x] Both now send a short-lived on-behalf token naming the account, domain-separated from the MCP actor token (its own purpose, 60 s)
- [x] /api/scan resolves the caller from the session or that token, picks the admin or shared budget from the account (re-derived per call), and counts the per-person cap by account for anyone signed in, by address only for signed-out visitors
- [x] Tests: the token verifies for its account, fails under another secret, and is not interchangeable with an actor token in either direction
- [x] `verify-oauth-live.mjs` step 7a (opt-in, EE_VERIFY_SCAN): one real scan through MCP, checked against the caller's own ledger
- Location: `src/server/mcp/grant.ts`, `src/server/accounts/spend-tier.ts`, `src/app/api/scan/route.ts`, `src/app/api/mcp/scan/route.ts`, `src/app/api/mcp/handoff/route.ts`, `mcp/scripts/verify-oauth-live.mjs`
