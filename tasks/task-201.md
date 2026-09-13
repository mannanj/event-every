### Task 201: Failed provider calls burn full reservations and one breach freezes the whole day

**Severity: Production risk** · Found 2026-09-12 while validating the Cloudflare deployment. The mechanism worked exactly as written — the concern is the blast radius under ordinary failure, not a defect in the accounting.

#### Observed

Roughly a dozen debugging requests, most of them provider failures, produced this:

```
limitNanodollars:     5000000000   ($5.00)
spentNanodollars:      144816160   ($0.145)
remainingNanodollars: 4855183840   ($4.86)
exhausted: true   frozen: true   resetAt: 2026-09-14T00:00:00.000Z
```

The app then rendered `owner-budget-screen` with no input box — the whole site went view-only with 97% of the day's budget unspent.

#### Two behaviors combined

**1. Failed calls are charged their full reservation.** `decideSettlement` in `src/platform/cloudflare/owner-budget-authority.ts` settles a missing or malformed outcome as `settled_full` for `row.reservationNanodollars`. A scan-text reservation is 20,000,000 nanodollars ($0.02), so the $0.145 spent is about seven failed scans at full price — while a *successful* scan measured roughly $0.00007. A failure therefore costs ~285× a success.

**2. A single cost-over-reservation freezes the entire UTC day.** Still in `decideSettlement`:

```ts
return { phase: 'settled', amount: cost.nanodollars,
         breachClass: 'primary_breach', freezeCode: 'accounting_policy_breach' };
```

Once `frozen_code` is set, `status()` reports `exhausted: true` regardless of remaining budget, and every user is locked out until the next UTC day. The Durable Object is addressed `idFromName(authorityDay)`, so recovery is only ever at midnight UTC — there is no reset path short of that.

#### Decide first

- [ ] Confirm the intended posture. Freezing hard on an accounting breach is defensible for a single-owner key; decide whether it should also take down *all* traffic, or only the route that breached.
- [ ] Decide whether a breach is an owner-alerting event. Today it is silent: the site simply stops working and nothing reports why.
- [ ] Decide whether failed calls should be charged at all. Charging full reservation for a provider 404 that never reached a model bills for spend that did not occur.

#### Implement

- [ ] Settle known-zero-cost failures at zero. A transport failure with no cost lexeme, and specifically a routing 404 that never reached a model, spent nothing and should not be charged a full reservation.
- [ ] Size reservations against measured cost. A $0.02 reservation against a $0.00007 actual is ~285× over — right-size it, or reserve adaptively from recent observed cost.
- [ ] Add an owner-visible signal when `frozen_code` is set: which code, which execution, what it cost, and when it resets.
- [ ] Provide a deliberate, audited unfreeze path for the owner, or document explicitly that midnight UTC is the only recovery and that this is intentional.
- [ ] Reconsider how much of the UI the freeze should gate. `OwnerBudgetScreen` already offers "View my events", so saved events remain reachable — but it is a full-page takeover (`min-h-screen`) that removes input, upload, and paste outright. Decide whether a frozen day should instead keep the normal interface and refuse only at submit, so the app reads as temporarily limited rather than replaced.

#### Prove

- [ ] Tests covering: a routing failure settles at zero; a successful call settles at exact cost; a genuine overspend still freezes.
- [ ] A test asserting `exhausted` is not reported while substantial budget remains and no breach has occurred.
- [ ] A test covering whatever unfreeze path is chosen, including that it cannot be triggered by an unauthenticated caller.

- Location: `src/platform/cloudflare/owner-budget-authority.ts`, `src/platform/provider/transport.ts`, `src/platform/cloudflare/provider-operation.ts`, `src/app/api/usage/`
