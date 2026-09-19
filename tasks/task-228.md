### Task 228: The workerd suite can load again

`verify:c1:b:mutations` failed at its first mutation, and not because the
mutation slipped through: the whole workerd suite failed to load, so no test ran
and the harness never saw the assertion it looks for.

Commit 799db9d added `import { ownerBudgetLedgerName } from
'@/platform/provider/policy'` to the provider request authority, which already
imported that same module eleven lines below as `'../provider/policy'`. The
Cloudflare workers pool resolves imports itself and does not read tsconfig
paths, so the aliased specifier reached it as a bare package name. The mutation
ledger was recorded four weeks earlier, which is why it still says PASS.

- [x] Fold the aliased import into the relative one the file already had
- [x] Confirm the suite loads: 34 tests run where none could before
- Location: `src/platform/cloudflare/provider-request-authority.ts`

Not fixed here, and pre-existing: 7 of those 34 fail on `provider request schema
unavailable`. Verified by applying this same one-line fix to 63143ac, which
fails identically, so it is neither caused by this change nor by Tasks 225-227.
