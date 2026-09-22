### Task 202: MCP server — let an AI client act as a signed-in user

**Severity: Product expansion** · Queued 2026-09-13, immediately after accounts landed. **Do not start until Task 203 is closed and the account system is accepted in production.** This builds directly on sessions and encrypted sync; starting before those are trusted means debugging two new things at once.

#### Why this is next, and not now

Accounts were built from `~/Documents/skeletons/signup-cloudflare`, which already carries a working MCP server and the OAuth bridge between it and the app. That half was deliberately left out: Event Every had no accounts, so there was no identity for an assistant to act as. There is now.

The skeleton's `docs/005-mcp-oauth.md` is the reference implementation, and `~/Documents/mcp` is the remote-MCP failure catalogue to build against. Read both before writing anything.

#### What the shape looks like

A **second Worker**, not a route on this one. The reason is not stylistic: OpenNext generates the app's entry point and owns the default export that `OAuthProvider` needs, so an MCP server cannot share it. The MCP Worker holds **no database** — every write goes back through this app's own API with a signed actor token, so "save an event" keeps one implementation instead of two that drift.

```
browser ──► eventevery.com (app Worker)      session cookie, host-only
                 │  /api/mcp/authorize        signs a 120s identity grant
                 ▼
            mcp.eventevery.com (MCP Worker)   OAuth 2.1 + PKCE, KV only
                 │  /authorize /token /register /callback /mcp
                 └──► back to the app's API with a 60s signed actor token
```

#### The join that needs care

The session cookie is deliberately host-only — no `Domain` attribute — so the MCP Worker on another hostname **cannot read it**. That is why a signed grant has to exist at all. Widening the cookie to `.eventevery.com` would delete the grant code and expose every session to every subdomain ever deployed. Do not take that shortcut.

`src/server/accounts/auth.ts` currently omits the skeleton's `mcp_state` column on `login_token` with a pointer to this task. Adding it back is the first migration here: a sign-in that began because an assistant asked to connect must return the person to that flow rather than to the home page.

#### Scope

- [x] Migration: add `mcp_state TEXT` to `login_token`, and thread it through `createLoginToken` / `consumeLoginToken` / the redeem redirect.
- [x] `/api/mcp/authorize` on the app Worker: find a session, sign a short-lived assertion bound to the request's opaque state, redirect back. Unauthenticated visitors go to sign-in carrying the state.
- [x] A second Worker with OAuth 2.1 + PKCE, dynamic client registration, and KV for parked authorization state. No D1 binding.
- [x] A signed actor token on every call back into this app's API, verified before any write.
- [x] Tools: `whoami`, `list_events`, `get_event`, `add_events`, `read_text_into_events`, `read_image_into_events`, `read_link_into_events`, `import_calendar`, `remove_event`. An assistant MAY spend owner budget, at the same caps as the web path — decided 2026-09-21. `import_calendar` spends nothing, and `add_events` spends nothing, and the tool descriptions say so.
- [x] Decided 2026-09-21: full event detail. An assistant that can see a title and not a location cannot do what it was connected for. `list_events` requires at least one filter and caps at 50, so there is no bare "give me everything" read.
- [x] Decided 2026-09-21: NO separate MCP rate limit. The MCP surface and the site run under the same limits, by explicit ruling. Kept here as a closed decision rather than deleted, so it is not reopened by someone reading the shape and assuming it was forgotten.

#### Prove

- [x] A scripted end-to-end run of the whole flow with no human clicking anything: `mcp/scripts/verify-oauth-live.mjs`. Production sends real mail, so there is no link to scrape - the session is seeded into D1 instead, and that is the only step skipped.
- [x] Refusal tests, live: a stranger at the bridge sent to sign-in, a grant bound to another state refused 400, an invented bearer token 401, a filterless list refused. Expiry and unknown-signer are covered by unit tests, which can move the clock.
- [x] A test proving one account's MCP token cannot read another account's events. Four ways: a list read, a known id, a removal by id, and the ciphertext copied across so the envelope is what refuses rather than the WHERE clause.

- Location: new `mcp/` Worker, `src/app/api/mcp/`, `src/server/accounts/auth.ts`, `migrations/accounts/`
