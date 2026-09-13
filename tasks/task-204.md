### Task 204: Provider key tiers - admin, signed-in, guest

**Severity: Capability gap** · Opened 2026-09-13. There is no admin key today and no way for one visitor to have different limits from another. Accounts landed the same day, so the identity this needs now exists.

#### What is actually there now

One key and one budget, shared by everybody:

- `OPENROUTER_OWNER_KEY` is the only provider key any code reads. `src/platform/cloudflare-context.ts` resolves it and nothing else.
- `OPENROUTER_COMMUNITY_KEY` and `OPENROUTER_MANAGEMENT_KEY` exist in `.env.local` and are **referenced nowhere in `src/`**. They are leftovers, not a second tier.
- The budget Durable Object is addressed `OWNER_BUDGET_AUTHORITY.idFromName(row.authorityDay)` - keyed by **UTC day only**. No identity enters it, so there is exactly one $5/day pot and every visitor draws from it.
- There is no tier, role, plan, admin or entitlement concept anywhere in `src/`.

Two consequences worth stating plainly:

1. **The owner has no bypass.** When the shared budget froze on 2026-09-13 it froze for the owner too, which is why the site went to the paused screen for everyone including the person who could have fixed it.
2. **Signing in currently buys nothing.** Accounts exist, sessions work, events sync - and a signed-in visitor gets exactly the same processing limits as an anonymous one.

#### The tiers wanted

| Tier | Who | Limit |
| --- | --- | --- |
| admin | the owner | none, and never blocked by the shared pot |
| signed-in | has an account | higher than guest, still bounded |
| guest | anonymous | today's community limit |

#### Decide first

- [ ] **Separate keys or one key with separate accounting?** A distinct admin key at OpenRouter gives a hard spend boundary and a separate bill; one key with per-tier budgets is simpler but means an admin runaway still drains the same account. Prefer separate keys for admin at minimum.
- [ ] **What "unlimited" means for admin.** Genuinely uncapped is a foot-gun - a loop in a tool can spend real money overnight. A very high cap with an alert is usually what people mean by unlimited.
- [ ] **What a signed-in allowance is worth,** measured against actual cost per scan (~$0.00007 observed) rather than guessed.
- [ ] How this relates to task 198's paid plans. These tiers are the mechanism those plans would sell; building them twice would be the waste.

#### Implement

- [ ] Derive the tier **server-side from the session**, never from anything the client sends. A guest claiming `tier: admin` in a request body must be impossible by construction.
- [ ] Mark admin by account, not by a flag a request can carry - an `admin` column on `account`, or an allowlist of addresses in a Worker secret. `hello@mannan.is` is the first entry.
- [ ] Key the budget authority by tier as well as day, so the DO name becomes something like `${authorityDay}:${tier}`. A guest exhausting the community pot must not touch the signed-in pot, and neither must reach the admin one.
- [ ] Select the provider key by tier where the owner key is resolved.
- [ ] Make `/api/usage` report the caller's own tier and limits, so the UI can say which pot it is showing rather than implying one global number.
- [ ] Retire `OPENROUTER_COMMUNITY_KEY` and `OPENROUTER_MANAGEMENT_KEY`, or give them a real job here. Unused credentials in `.env.local` are a liability with no upside.

#### Prove

- [ ] A guest cannot obtain a signed-in or admin allowance by any request it controls - body, header, cookie shape, or query.
- [ ] Exhausting the guest pot leaves the signed-in and admin pots untouched, and vice versa.
- [ ] An admin request succeeds while the guest pot is frozen. This is the case that took the site down on 2026-09-13 and is the one worth a regression test.
- [ ] Tier is reported correctly for anonymous, signed-in and admin callers.

#### Related

Task 201 - failed calls charge a full reservation and one breach freezes the whole day. Splitting the pot by tier reduces that blast radius but does not fix the underlying accounting, and the two should be designed together.
Task 198 - paid accounts. These tiers are what a plan would grant.

- Location: `src/platform/cloudflare-context.ts`, `src/platform/cloudflare/owner-budget-authority.ts`, `src/platform/cloudflare/provider-request-authority.ts`, `src/server/accounts/`, `src/app/api/usage/`, `migrations/accounts/`
