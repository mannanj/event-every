### Task 245: Give the admin tier its own ledger, by naming the policy it spends under

**Severity: Feature** · Opened 2026-09-21, split out of task-244. **Rewritten 2026-09-21 after an independent assessment found the original design wrong.** The first version proposed a `tier` column on `provider_request` and a two-release schema migration. Neither is needed, and the migration could never have completed. What follows is the corrected design; the history is kept because the rejected reasoning is the instructive part.

#### What is already done (task-244)

- `src/server/accounts/admin.ts`: `hello@mannan.is`, an additive env override, `isAdminEmail`, `shouldEnforceDailyCaps`. 14 tests.
- `account.unlimited`, migration 0004, applied in production.
- `OPENROUTER_ADMIN_KEY` is a Worker secret: a second OpenRouter key with its own $1/day, so admin traffic and ordinary traffic cannot exhaust each other.

Nothing reads any of it.

#### The problem

Two tiers need separate budget ledgers, or an admin spending from the shared $1 simply ends the day early for everybody. A ledger is a Durable Object named by `ownerBudgetLedgerName(day)`, whose own comment states the constraint:

> Both the reserve and the settle paths must derive the name here. If they ever disagree, a request settles against a ledger it never reserved from.

Reserve knows the tier. Settle runs later from the stored row.

#### WHY THE FIRST DESIGN WAS WRONG

It proposed adding a `tier` column, having rejected `policyVersion` because "`validBinding` refuses anything but the single `OWNER_POLICY_VERSION` constant".

**That is a validator, not a storage limit.** Verified:

- `policy_version` is already column `cid: 7` on `provider_request` (`provider-request-authority.ts:129`), written on begin and read back at `:676`. Settle already has it.
- The budget ledger already stores it per day, and `ownerBudgetLedgerName` is already documented as "keyed by the policy it was opened under" (`policy.ts:14`).
- It is already compared on replay by `sameBeginBinding` and `sameBinding`.

A second OpenRouter key with its own ceiling **is a second policy**. The carrier already exists; the only thing in the way was a validator that can be widened.

And the column design could not have shipped. `ProviderRequestAuthority` validates its schema in the constructor inside `blockConcurrencyWhile` (`:177-181`), comparing `PRAGMA table_info` against a positional column list. Tombstone rows are inserted (`:548`) and never deleted, so **every request digest that ever completed still has a Durable Object with the old table, permanently.** There is no date after which requiring a new column is safe, so the proposed second release could never have run. `ALTER TABLE ADD COLUMN` also appends, so a migrated column lands at `cid: 24` while a fresh one written next to `policy_version` lands at `cid: 8` - one population failing validation forever.

#### The design

Keep the tier out of storage entirely. Let it choose a policy, and let the policy name the ledger.

- `policy.ts`: keep `OWNER_POLICY_VERSION = 'owner-v1'`; add `ADMIN_POLICY_VERSION = 'admin-v1'` and a `POLICIES` map from version to `{ limitNanodollars, keyEnv }`.
- `ownerBudgetLedgerName(day, version = OWNER_POLICY_VERSION)` returns `${version}:${limit(version)}:${day}`. **The default must be byte-identical to today's name**, or every row reserved before the deploy settles somewhere it never reserved.
- Settle: `ownerBudgetLedgerName(row.authorityDay, row.policyVersion)`. The row already has it.
- Reserve: `/api/scan` resolves the tier with `shouldEnforceDailyCaps` and passes the version down.
- Validators: the `=== OWNER_POLICY_VERSION` checks become set membership.
- Key selection and ledger selection come from **one map, one decision**. A missing admin key degrades to the owner policy entirely - never an admin ledger paired with the owner key, which would let the ledger say yes past what the key honours and hand control back to OpenRouter's 402.

Every in-flight row says `owner-v1`, so it settles exactly where it reserved. No column, no migration, no positional-cid risk.

The cost: `policy_version` carries two meanings, generation and tier. Acceptable, because the name already includes the limit and a future bump becomes `owner-v2` / `admin-v2` - which is the fresh-ledger-per-policy behaviour the comment already describes.

#### Scope

- [x] Latent bug first: `owner-budget-authority.ts:130` INSERTs the constant `OWNER_POLICY_VERSION` while `:134` compares `input.policyVersion`. Equal today, so harmless; with a second version the admin ledger's first reserve writes `owner-v1` and every later one returns `conflict` forever. Fix and test before anything else.
- [x] `SPEND_POLICIES` map; `ownerBudgetLedgerName(day, version)` with a byte-identical default.
- [x] Settle derives from `row.policyVersion`.
- [x] `/api/scan` reads the session and resolves the tier. A signed-out visitor is always the owner policy.
- [x] Validators take a set. `owner-budget-authority.ts:130` writes the input's version; `:134`, `:140`, `:260` take the limit from the policy rather than the constant.
- [x] **`/api/usage` and `OwnerBudgetBoundary`.** A third derivation of the ledger name lives at `runtime.ts:70` and has no session. Left alone, a visitor-heavy day that exhausts the owner ledger takes the whole UI away from an admin - the precise isolation this task exists to provide, inverted. `runtime.test.ts:101-102` pins the one-argument call.
- [ ] Task 244's remaining box: a per-user cap beneath the platform ceiling.

#### Prove

- [x] A literal-string test that `ownerBudgetLedgerName('2026-09-21')` is exactly `owner-v1:1000000000:2026-09-21`. Asserting it against itself proves nothing.
- [x] A Durable Object constructed over a PRE-EXISTING table still works. Build it from the literal old DDL, not from "current schema minus a column", or it cannot catch a positional mismatch. Include a tombstone-only instance, which is the permanent population.
- [x] A reserve and a settle on the admin policy agree on a ledger.
- [x] An admin exhausting the admin ledger leaves the owner ledger untouched, and the reverse.
- [x] A row reserved under `owner-v1` before the change settles against the same ledger after it: the default name is byte-identical, asserted as a literal.
- [x] A missing `OPENROUTER_ADMIN_KEY` degrades to the owner policy for BOTH key and ledger, never a mixed pair.
- [x] `bun run test:workers` is 126/126, up from 114.

#### Rollback

Old code reading a row whose policy version it does not recognise throws from `assertRequestRow` (`:988`). Rolling back after an admin request has begun strands that request: its DO wedges until the budget ledger's own lease sweep settles it at the full reservation. Fewer instances than the column design would have stranded, but not zero - worth accepting deliberately rather than discovering.

- Location: `src/platform/provider/policy.ts`, `src/platform/cloudflare/owner-budget-authority.ts`, `src/platform/cloudflare/provider-request-authority.ts`, `src/platform/runtime.ts`, `src/app/api/scan/route.ts`, `src/app/api/usage/route.ts`
