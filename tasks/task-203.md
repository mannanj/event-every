### Task 203: Close the gaps the account system shipped with

**Severity: Hardening** · Opened 2026-09-13 alongside the accounts work. Stated up front rather than discovered later. Nothing here blocks sign-in working; each is a thing a real account system needs and this one does not have yet.

#### Turnstile is wired but not enabled

`/api/auth/challenge` verifies Turnstile **only when `TURNSTILE_SECRET` is set**, and it is not set. Today the sole protection on "make eventevery.com send mail to an address somebody typed" is the D1 rate limit — 3 per 15 minutes per address, 10 per hour per IP.

That limit is the one that stops a mailbomb, so this is not wide open. But the two controls answer different questions: Turnstile asks "is this a person", the limit asks "has this happened too often". A solved-token farm or a slow human-paced drip only meets the second.

- [ ] Create a Turnstile widget for eventevery.com and set `TURNSTILE_SITEKEY` (var) and `TURNSTILE_SECRET` (secret). The `turnstile-spin` skill automates this end to end.
- [ ] Render the widget in `AccountMenu` and pass its token as `turnstileToken`. The server half already reads it.
- [ ] Test the refusal path: a missing token and a replayed token must both fail.

#### Nothing is ever swept

Three tables grow without bound:

- [ ] `login_token` — spent and expired rows. `idx_login_token_expires` exists for exactly this.
- [ ] `session` — rows past `expires_at`. `readSession` already refuses them, so these are dead weight rather than a hole.
- [ ] `rate_limit` — `sweepRateLimits()` is written and called by nothing.
- [ ] Add a cron trigger and call all three. A Worker cron is a few lines; the index work is already done.

#### No account lifecycle

- [ ] **Deletion.** No way to delete an account. The schema cascades (`ON DELETE CASCADE` from `account` through `session`, `account_key` and `synced_event`), and `deleteAllEvents` exists, so the data half is ready — the route and the confirmation flow are not.
- [ ] **Export.** No way to get your events out as data. `/api/sync/pull` returns them decrypted and is most of the answer.
- [ ] **Email change.** The address is the identity, so changing it is an account migration, not a field edit. Decide whether it is supported at all.

#### Test coverage is uneven

`src/server/accounts/crypto.ts` has ten unit tests covering the round trip, the AAD row binding, tampering, and cross-account isolation. The rest was validated by driving production directly and is not covered by an automated test.

- [ ] Integration tests for `auth.ts` and `store.ts` against real local D1. `@cloudflare/vitest-pool-workers` and `vitest.config.workers.ts` are already configured (`bun run test:workers`) — this is where they belong, because the logic is SQL and a hand-written fake would prove nothing.
- [ ] Cover specifically: single-use token burn under two simultaneous redemptions, session expiry, the `account_key` creation race, and that one account cannot pull another's rows.
- [ ] An end-to-end sign-in test reading the magic link from the Worker log with `EMAIL_PROVIDER=console`, the way the skeleton's `scripts/oauth-e2e.sh` does.

#### Key rotation is designed but unexercised

`key_version` is on `account_key` and `synced_event` from row one, so rotating the master key is a migration over rows rather than a schema change. That path has never been run.

- [ ] Write the re-wrap procedure: new KEK, unwrap each DEK under the old, re-wrap under the new, bump `key_version`.
- [ ] Decide where the previous KEK lives during a rotation, and how long.

- Location: `src/server/accounts/`, `src/app/api/auth/`, `src/components/AccountMenu.tsx`, `wrangler.jsonc`, `vitest.config.workers.ts`
