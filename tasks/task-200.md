### Task 200: Decide the C1-A config gate's stance now that the Worker is deployed

**Severity: Blocking decision** · Raised 2026-09-12 during the Cloudflare cutover. `bun run verify:c1:a` fails today. Not in CI (`bun test src` does not reach it), so nothing else is blocked — but the repo's own proof of configuration is currently red.

#### Observed

```
$ bun run assert:c1:a-config
error: c1-a config: wrangler.workers_dev
```

`scripts/assert-c1-a-config.ts` pins the scaffold as deliberately nondeployable. It asserts, exactly:

| Assertion | Scaffold value | Deployed value |
| --- | --- | --- |
| `wrangler.workers_dev` | `false` | `true` |
| `wrangler.d1_databases` | `event-every-local-disabled` / `1111…1111` sentinel | `spirit-hammer-waitlist` / `aee71288-…` |
| `wrangler.vars.C1_DEPLOYMENT_DISABLED` | `"1"` | absent |
| `'routes' in wrangler` | must be absent | two `custom_domain` entries serving eventevery.com |
| `exactExecutable('cloudflare/app-worker.ts')` | byte-exact pin | adds the `MAINTENANCE_MODE` gate |

The assertion now fails on `cloudflare/app-worker` before it ever reaches `workers_dev`, because the Worker gained the maintenance-mode check that serves `statusPages`. Every one of these five is a deliberate change made during the 2026-09-13 cutover, not drift.

The accepted design records this as intentional: *"Deployment, DNS, production data, credentials, and paid calls remain later gates"* (`docs/superpowers/specs/2026-08-02-event-every-cloudflare-migration-design.md`), and the C1-A plan states *"At no intermediate commit may `C1_DEPLOYMENT_DISABLED` be absent or empty."* That gate has now been crossed deliberately, so the assertion no longer describes reality.

#### Decide first

- [ ] Choose the gate's future. Three coherent options, in preference order:
  1. **Two-stance gate.** `assert-c1-a-config` takes an explicit stance (`scaffold` | `deployed`) and asserts the matching exact config. Preserves the proof discipline and makes crossing the gate a visible, reviewed change rather than a deletion.
  2. **Re-point to deployed.** Rewrite the pinned values to the deployed stance. Simpler, but silently loses the ability to prove the scaffold was ever nondeployable.
  3. **Retire it.** Delete the deployment-related assertions, keeping the structural ones (bindings, migrations, DO classes). Least work, least protection.
- [ ] Confirm who reviews this. The migration design is marked *"proposed under Autonomous Stewardship; independent architecture/security review required"* — decide whether retiring a safety gate needs that review or is owner's discretion.

#### Implement

- [ ] Apply the chosen option to `scripts/assert-c1-a-config.ts` and its companion `scripts/assert-c1-a-config.test.ts`.
- [ ] Decide the deployed value of `workers_dev`. It is `true` today only so the Worker could be validated before DNS moved; the original design set `false` with `preview_urls: false`. Once a custom domain serves the app, turn it off unless a staging URL is wanted deliberately.
- [ ] Update `docs/superpowers/plans/2026-08-02-event-every-cloudflare-c1-a-runtime-admission.md` so the checklist no longer asserts a disable flag that production does not carry.
- [ ] Record the D1 binding decision: `EVENT_EVERY_DB` now names the real `spirit-hammer-waitlist` database, but nothing in `src/` reads the binding — `src/lib/d1.ts` still speaks HTTP through the proxy Worker. Either wire the binding through or note explicitly that it is reserved for later.

#### Prove

- [ ] `bun run assert:c1:a-config` passes against the committed config.
- [ ] `bun run verify:c1:a` passes end to end.
- [ ] A test proving the gate still fails when the config drifts from the declared stance, so the assertion cannot silently become a no-op.

- Location: `scripts/assert-c1-a-config.ts`, `scripts/assert-c1-a-config.test.ts`, `wrangler.jsonc`, `docs/superpowers/plans/2026-08-02-event-every-cloudflare-c1-a-runtime-admission.md`
