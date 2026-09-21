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

- [ ] `src/server/accounts/admin.ts`: `DEFAULT_ADMIN_EMAILS = ['hello@mannan.is']`, an env override, `isAdminEmail`, `shouldEnforceDailyCaps`.
- [ ] Migration: `account.unlimited INTEGER NOT NULL DEFAULT 0`.
- [ ] Thread it into the scan path, which is where the owner budget is spent.
- [ ] Tests: an ordinary account is capped, an admin is not, an unlimited account is not, and an unlimited account gets nothing else.

#### The part that needs a decision, not code

`/api/scan` is anonymous today. It takes a request id and no session, which is why an exemption has to be read somewhere the session is available. Reading the cookie there is the small change; the question it raises is what happens for a signed-out visitor, and the answer has to stay "capped", or the exemption is a hole rather than a role.

#### The backstop Green Light has and this does not

In Green Light both tiers still sit under a monthly budget governor - a platform ceiling rather than a per-user fairness rule. Event Every has only the daily authority, so an uncapped account here is uncapped full stop. That is a real difference from the design being copied and it is stated rather than papered over. See task-201, which owns the budget authority.

- Location: `src/server/accounts/admin.ts`, `migrations/accounts/0004_unlimited.sql`, `src/app/api/scan/`
