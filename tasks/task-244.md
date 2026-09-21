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

**The mechanism is built and tested and does nothing yet, deliberately.** It
cannot be wired until one of these is true:

- the OpenRouter key's own daily limit is raised, and
  `OWNER_DAILY_LIMIT_NANODOLLARS` with it, so there is headroom to hand out; or
- a per-user daily cap is introduced beneath the platform ceiling, at which
  point `shouldEnforceDailyCaps` is exactly the thing that gates it.

Wiring it before either would not grant a privilege. It would move where the
app breaks.

#### The backstop Green Light has and this does not

In Green Light both tiers still sit under a monthly budget governor - a platform ceiling rather than a per-user fairness rule. Event Every has only the daily authority, so an uncapped account here is uncapped full stop. That is a real difference from the design being copied and it is stated rather than papered over. See task-201, which owns the budget authority.

- Location: `src/server/accounts/admin.ts`, `migrations/accounts/0004_unlimited.sql`, `src/app/api/scan/`
