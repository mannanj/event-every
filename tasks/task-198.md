### Task 198: Add paid accounts and community-processing subscriptions with Stripe

**Severity: Product expansion** · Requested 2026-08-13. This is a future, separately designed and reviewed feature. Do not show the paid-account offer on the public pause screen until signup, Checkout, entitlement enforcement, billing management, and recovery paths all work end to end.

#### Product promise

When community-funded event processing is paused, offer a working path to paid access without framing Event Every as having run out of money.

Public paused-screen addition after launch:

> You can also make an account for $0.99/month.

The sentence links to the account/pricing flow. The nearby pricing UI must make recurring billing, renewal cadence, cancellation, limits, and annual pricing clear before Checkout.

#### Plans

| Plan | Monthly | Annual (20% discount, rounded to cents) | Access promise |
| --- | ---: | ---: | --- |
| Nearly Unlimited | $0.99/month | $9.50/year | High but explicit event-processing limits, displayed before purchase and on the account page |
| Unlimited | $2.99/month | $28.70/year | Unlimited ordinary event processing, subject only to clearly disclosed fair-use, automated-abuse, file-safety, and provider-safety controls |

The annual cent amounts are the nearest practical Stripe prices to 80% of twelve monthly payments. Reconfirm price arithmetic, currency, taxes, refund terms, and consumer disclosures before creating live Stripe Prices.

“Nearly Unlimited” may not launch until its exact daily/monthly processing allowance, burst behavior, file/image limits, reset rules, and over-limit experience are defined from measured unit economics and displayed consistently. “Unlimited” must not hide a normal-use numerical quota; any safeguards must target abuse or technical safety and be disclosed in plain language.

#### Account and entitlement scope

- [ ] Design the account identity, sign-in, account recovery, session security, deletion, and email-verification model before implementation. Never use a Stripe billing email as authentication.
- [ ] Persist account, Stripe Customer ID, Stripe Product, Subscription ID, status, billing interval, current period, cancellation state, and internal entitlement server-side. Do not treat browser storage or the Checkout success redirect as payment authority.
- [ ] Define one closed entitlement model shared by UI, API admission, owner budget/provider authorities, and account page. Paid access must not bypass global safety, payload, abuse, or provider-cost controls.
- [ ] Define how existing anonymous local drafts/events remain available after signup, sign-in on another device, logout, cancellation, account deletion, and failed payment. Do not upload local user data merely because the user creates an account; any sync/storage expansion needs its own explicit privacy design and consent.

#### Stripe implementation

- [ ] Create two Stripe Products (Nearly Unlimited and Unlimited), each with separate monthly and annual recurring Prices. Keep test/live Price IDs in server-only configuration and allowlist exact IDs; never accept arbitrary client-provided price IDs or amounts.
- [ ] Build a server-created Stripe Checkout Session in subscription mode. Bind it to the authenticated account with opaque internal metadata, use an idempotency key, return the Checkout Session URL, and navigate directly to that URL.
- [ ] Add success and cancellation pages. Success must show “activating” until the signed webhook-derived entitlement is durable; the redirect alone never grants access.
- [ ] Add a raw-body Stripe webhook endpoint with signature verification, replay-safe `event.id` deduplication, bounded parsing, fixed responses, and no secrets or sensitive payloads in logs.
- [ ] Handle at minimum `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Decide whether Stripe Entitlements or an internal product-to-entitlement projection is authoritative, then keep a durable internal read model for fast admission.
- [ ] Provision access only for accepted paid/active states; define grace, `past_due`, `unpaid`, incomplete, paused, canceled-at-period-end, refunded/disputed, upgrade, downgrade, monthly↔annual, and webhook-outage behavior before launch.
- [ ] Integrate Stripe’s hosted Customer Portal for plan changes, cancellation, payment-method updates, and invoice history. Continue consuming subscription webhooks because portal changes happen asynchronously.
- [ ] Validate the Stripe SDK/runtime path against the deployed Cloudflare/OpenNext target before selecting dependencies or APIs. Secrets remain server-side and unavailable to the browser bundle.

#### Product surfaces

- [ ] Add an account/pricing page comparing both plans, monthly/annual toggle, the exact 20% annual saving, exact Nearly Unlimited limits, Unlimited fair-use language, renewal/cancellation terms, taxes where applicable, and a link to privacy/data-use information.
- [ ] Add an authenticated account/billing page showing current plan, effective limits, usage/reset state, renewal date, cancellation state, invoices/receipts entry point, and **Manage billing**.
- [ ] Add the `$0.99/month` paid-account offer to the paused screen only when the pricing/account route and subscription system pass the launch gates. Keep **View my events** as the primary no-purchase path; paid signup must be optional.
- [ ] Preserve the existing local-first experience for people who do not create an account.

#### Tests and launch gates

- [ ] Unit-test plan/price allowlisting, annual-price display, entitlement transitions, status mapping, limits, and fail-closed admission.
- [ ] Integration-test verified and invalid webhook signatures, duplicate/out-of-order events, Checkout idempotency, successful renewal, failed payment, cancellation, upgrade/downgrade, interval switch, and portal-originated changes.
- [ ] E2E-test anonymous → pricing → signup → Stripe test Checkout → webhook activation → paid processing, plus cancel/failure paths and continued access to saved local events.
- [ ] Mutation-prove that the tests catch bypassed signature verification, redirect-based access grants, client-controlled price IDs, duplicate fulfillment, stale cancellation state, and quota bypass.
- [ ] Complete security, privacy, accessibility, copy/legal, unit-economics, Cloudflare runtime, and Stripe test-mode reviews before any live key, live Price, deployment, or public paid-account copy is authorized.

#### Primary references

- Stripe subscriptions: https://docs.stripe.com/billing/subscriptions/build-subscriptions
- Stripe subscription webhooks: https://docs.stripe.com/billing/subscriptions/webhooks
- Stripe customer portal: https://docs.stripe.com/customer-management/integrate-customer-portal
- Stripe entitlements: https://docs.stripe.com/billing/entitlements
