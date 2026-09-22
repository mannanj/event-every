### Task 245: Give the admin tier its own ledger, without breaking the ones in flight

**Severity: Feature, blocked on care** · Opened 2026-09-21, split out of task-244. The policy half of admin/unlimited is built, tested and inert; this is the half that makes it do something, and it is a separate task because it is surgery on the money path rather than a line of wiring.

#### What is already done (task-244)

- `src/server/accounts/admin.ts`: `hello@mannan.is`, an additive env override, `isAdminEmail`, `shouldEnforceDailyCaps`. 14 tests.
- `account.unlimited`, migration 0004, applied in production.
- `OPENROUTER_ADMIN_KEY` is a Worker secret. A second OpenRouter key with its own $1/day, so admin traffic and ordinary traffic cannot exhaust each other.

Nothing reads any of it.

#### What is missing, and why it is not one line

The two tiers need **separate budget ledgers**, or an admin spending from the shared $1 simply ends the day early for everybody. The ledger is a Durable Object named by `ownerBudgetLedgerName(day)`, and that function carries the constraint that governs this whole task:

> Both the reserve and the settle paths must derive the name here. If they ever disagree, a request settles against a ledger it never reserved from.

Reserve knows the tier: it has the request. **Settle does not.** It runs later, inside `ProviderRequestAuthority.drainDueOutbox`, from the stored row:

```ts
const budget = this.requestEnv.OWNER_BUDGET_AUTHORITY.get(
  this.requestEnv.OWNER_BUDGET_AUTHORITY.idFromName(ownerBudgetLedgerName(row.authorityDay)),
);
```

So the tier has to be **on the row**. Three cheaper routes were tried and all are closed, correctly:

| Idea | Why it fails |
|---|---|
| Carry the tier in `policyVersion` | `validBinding` refuses anything but the single `OWNER_POLICY_VERSION` constant |
| Carry it in `authorityDay` | `validUtcDay` refuses anything that is not a bare UTC day |
| Derive it at settle time from the account | The row holds no account id, and adding one is the same schema change |

#### THE HAZARD, which is the reason this is its own task

`ProviderRequestAuthority` does not migrate its schema. It **asserts** it: exact `SchemaColumn` lists with positional `cid`s, regex checks over the `CREATE TABLE` text (`STATE_CHECK`, `SETTLEMENT_CHECK`, `EXECUTION_ID_UNIQUE`, ...), and `throw schemaError()` on any mismatch.

Every Durable Object already live in production has the current table. Adding a column without a migration path means each of those instances fails its own assertion the moment it wakes - **while holding money in flight**. A reservation that cannot settle is a reservation that never releases.

That is not a thing to discover after deploying.

#### Scope

- [ ] Decide the migration shape FIRST. Either `ALTER TABLE ADD COLUMN` guarded by a version row read before the assertion, or accept the new column as optional in the assertion for one release and require it in the next. Write down which, and why, before any code.
- [ ] `tier TEXT NOT NULL DEFAULT 'owner'` on `provider_request`, threaded through `BeginInput`, the binding contracts, `BINDING_KEYS`, `SETTLEMENT_KEYS` and both validators.
- [ ] `ownerBudgetLedgerName(day, tier)`, with the default tier producing the CURRENT name unchanged - so every ledger already open stays open and nothing in flight is stranded.
- [ ] `/api/scan` reads the session, resolves the tier via `shouldEnforceDailyCaps`, and passes it. A signed-out visitor is `owner`, always.
- [ ] Select `OPENROUTER_ADMIN_KEY` for the admin tier in `getProviderOperationContext`.
- [ ] Task 244's remaining box: a per-user cap beneath the platform ceiling, which is what `shouldEnforceDailyCaps` was written to gate.

#### Prove

- [ ] A reserve and a settle on the admin tier agree on a ledger, asserted directly - this is the failure the whole task is shaped around.
- [ ] An admin exhausting the admin ledger does not affect the owner ledger, and the reverse.
- [ ] A Durable Object created under the OLD schema still works after the change. This is the test that would have caught the hazard above, and it must exist before the change ships.
- [ ] `bun run test:workers` stays at 114/114.

- Location: `src/platform/cloudflare/provider-request-authority.ts`, `src/platform/cloudflare/owner-budget-authority.ts`, `src/platform/provider/policy.ts`, `src/app/api/scan/route.ts`
