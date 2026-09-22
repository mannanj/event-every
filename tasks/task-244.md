### Task 244: Two ways to be uncapped, and they are not the same thing

**Severity: Product** · Opened 2026-09-21. Ported from `~/Documents/greenlights/web/lib/adminAccess.ts`, whose design and decisions this follows deliberately rather than reinventing.

#### What did not exist here

Event Every had no role concept at all before this: no column, no admin list, no check. One `OPENROUTER_OWNER_KEY` and one `OWNER_DAILY_LIMIT_NANODOLLARS` of $1.00 shared by everybody, enforced by `OwnerBudgetAuthority` per UTC day.

Green Light has had the answer for a while. This is that answer, moved.

#### The two tiers, and why they are separate

```
admin      the owner list, from DEFAULT_ADMIN_EMAILS plus an env var.
           Unbounded, and carries every other admin power with it.

unlimited  a column on one account. Lifts the daily cap and NOTHING else:
           no admin surface, no ability to grant it to anyone else.
```

Collapsing them into one flag is the mistake this shape exists to avoid. "May bypass the spend cap" and "may do administrative things" are different questions, and answering both with one bit means the day somebody needs uncapped spend they also get everything else.

#### Scope

- [x] `src/server/accounts/admin.ts`: `DEFAULT_ADMIN_EMAILS = ['hello@mannan.is']`, an env override, `isAdminEmail`, `shouldEnforceDailyCaps`.
- [x] Migration: `account.unlimited INTEGER NOT NULL DEFAULT 0`.
- [ ] BLOCKED, see below. Thread it into the scan path once there is a cap to lift.
- [x] Tests: an ordinary account is capped, an admin is not, an unlimited account is not, and an unlimited account gets nothing else.

#### The part that needs a decision, not code

`/api/scan` is anonymous today. It takes a request id and no session, which is why an exemption has to be read somewhere the session is available. Reading the cookie there is the small change; the question it raises is what happens for a signed-out visitor, and the answer has to stay "capped", or the exemption is a hole rather than a role.

#### BLOCKED: there is nothing here to exempt anyone from

Found while wiring it, in `src/platform/provider/policy.ts`:

```ts
// $1/day, matched to the ceiling the OpenRouter key itself carries. The app
// must not plan to spend past what the key will actually allow, or the budget
// stops being the thing that says no and OpenRouter's 402 becomes the control.
export const OWNER_DAILY_LIMIT_NANODOLLARS = 1_000_000_000 as const;
```

Green Light's `unlimited` lifts a **per-user daily cap** that sits underneath a
**platform ceiling**. Event Every has only the ceiling. The $1/day is not a
fairness rule between users - it is the whole app's spending limit, and it is
set to exactly what the OpenRouter key will honour.

So an account exempted from it does not become uncapped. It becomes the thing
that ends the day early for everybody, and the refusal moves from this app's
clean "budget exhausted" to an OpenRouter 402 - which is precisely the failure
the comment above exists to prevent.

**The mechanism is built and tested and does nothing yet, deliberately.**
Wiring it against the single shared ledger would not grant a privilege. It would
move where the app breaks.

#### The answer: a second key, not a bigger one

Decided 2026-09-21. `OPENROUTER_ADMIN_KEY` is a separate OpenRouter key with its
own $1/day ceiling, and the admin and unlimited tiers spend from it.

Two keys rather than one raised limit, because the point is **isolation, not
headroom**:

- an admin looping a tool cannot exhaust what ordinary visitors spend from
- a busy day for visitors cannot lock the owner out of his own app
- each key's ceiling still matches what that key will actually honour, which is
  the rule `OWNER_DAILY_LIMIT_NANODOLLARS` exists to keep

The key is set as a Worker secret (`wrangler secret put OPENROUTER_ADMIN_KEY`)
and held locally in `.dev.vars`, which is gitignored. It is declared in
`ProviderBindingEnv` and read by nothing yet.

#### What is still in the way

The ledger name has to differ per tier, and `ownerBudgetLedgerName` carries this
warning:

> Both the reserve and the settle paths must derive the name here. If they ever
> disagree, a request settles against a ledger it never reserved from.

Reserve knows the tier: it has the request. Settle does not - it works from the
stored row (`provider-request-authority.ts`, the `row.authorityDay` call). So
the tier has to be **persisted on the provider-request row** for the two to
agree.

That is a storage change inside the budget authority, which task-201 owns and
which has failing tests today. Doing it from this branch would mean editing the
money-handling code while it is already red, so it waits.

#### The backstop question, answered

Green Light keeps both uncapped tiers under a monthly budget governor - a
platform ceiling rather than a per-user fairness rule. Event Every has no
monthly governor, which looked like a gap worth filling.

It is not, and the reason is in `policy.ts`:

> `$1/day, matched to the ceiling the OpenRouter key itself carries.`

**The key is the backstop.** Each OpenRouter key will not honour spending past
its own daily limit, so a runaway tier stops at the provider whatever this app
believes. Building a monthly governor here would add a second ceiling underneath
one that already exists and is enforced by somebody else's billing system - more
accounting to keep correct, for a guarantee already held.

What Green Light needs a monthly governor for is a different shape: many users
sharing one key, where a per-user daily cap does not bound the total. Event
Every gives each TIER its own key, so the total is bounded by construction.

So: no monthly ceiling. The thing to keep true instead is the invariant that
already exists - `OWNER_DAILY_LIMIT_NANODOLLARS` must never exceed what the key
will actually allow, per key. If a key's limit is raised, raise it here too; if
it is lowered, lower it here FIRST, or OpenRouter's 402 becomes the control and
this app stops being the thing that says no.

#### The difference from Green Light, stated

In Green Light both tiers still sit under a monthly budget governor - a platform ceiling rather than a per-user fairness rule. Event Every has only the daily authority, so an uncapped account here is uncapped full stop. That is a real difference from the design being copied and it is stated rather than papered over. See task-201, which owns the budget authority.

- Location: `src/server/accounts/admin.ts`, `migrations/accounts/0004_unlimited.sql`, `src/app/api/scan/`
