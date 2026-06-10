# Cost analysis — community access budget

How much Summon costs to run per user action, what the $5/day community budget
buys, and how the limit is detected programmatically. Pricing fetched live from
`GET https://openrouter.ai/api/v1/models` on 2026-06-10.

## Models in use & pricing

| Role | Model | Input $/M tok | Output $/M tok |
|---|---|---|---|
| Event extraction (text + vision) | `mistralai/mistral-large-2512` | $0.50 | $1.50 |
| URL detection pre-pass | `mistralai/mistral-large-2512` | $0.50 | $1.50 |
| Recent-summons card labels | `mistralai/ministral-8b-2512` | $0.15 | $0.15 |
| Timezone resolution | `deepseek/deepseek-chat-v3-0324` | $0.20 | $0.77 |

Cache-read discounts (10% of input price on Mistral) are ignored below —
estimates are conservative.

## Per-action costs

Token assumptions: parse system prompt ≈ 1,000 tok, tool schema ≈ 350 tok,
typical pasted text 50–500 tok, tool-call output 150–400 tok per event.
**These are estimates for planning; the app records the exact cost of every
call** from OpenRouter's `usage.cost` field, so reality is always visible at
`/api/usage` regardless of how good these guesses are.

| Action | Tokens (in / out) | Est. cost |
|---|---|---|
| Text summon, 1 event | ~1.6k / ~0.3k | ~$0.0013 |
| URL-detection pre-pass (every text submit) | ~0.3k + text / echoes text | ~$0.0004 short text, ~$0.01 for a 5k-token paste |
| Image summon (flyer/screenshot) | + ~1k–4k image tok | ~$0.002–$0.004 |
| URL summon (scrape is free; parse on ~1–3k tok of page text) | ~2.5k–4.5k / ~0.4k | ~$0.002–$0.003 |
| Card label (per Recent summons entry) | ~0.15k / 16 max | ~$0.00003 |
| Timezone resolve (per unresolved-TZ event) | ~0.15k / ~0.03k | ~$0.00007 |

A complete typical summon (pre-pass + parse + label + occasional TZ resolve):
**~$0.002 for text, ~$0.003–$0.005 for images.** The widest error bar is image
tokenization (Mistral doesn't publish per-image token counts); watch
`/api/usage` for actuals during the first days.

## User scenarios

| Scenario | Summons/day | Cost/day | Cost/month |
|---|---|---|---|
| Curious visitor | 2 | ~$0.005 | ~$0.15 |
| Regular user | 10 | ~$0.025 | ~$0.75 |
| Power user | 50 | ~$0.12 | ~$3.75 |

## What $5/day buys

- ~1,200–2,500 typical summons per day (mix-dependent)
- At ~3 summons per active user: **~400–800 free users/day**
- A single abusive IP is additionally capped by the existing rate limiter
  (1,000 events/day/IP) ≈ $2–4 worst case before the shared budget halts it

## How the limit is detected programmatically

Three layers, strongest first:

1. **Exact metering (implemented).** Every OpenRouter response automatically
   includes `usage.cost` (USD). Server routes accumulate it in Upstash Redis
   (`budget:community:<UTC date>`, `INCRBYFLOAT`) and pre-check before each
   call. Once spent ≥ `DAILY_BUDGET_USD`, routes return
   `402 { code: 'community_limit', resetAt }` and the UI shows the
   community-sponsored screen. Reset is midnight UTC; the client renders it in
   the visitor's browser timezone. Status endpoint:
   `GET /api/usage` → `{ limitUsd, spentUsd, remainingUsd, exhausted, resetAt, isAdmin }`.
   Admins (pattern-lock cookie) bypass the budget and use the unrestricted key.

2. **Upstream backstop (recommended, 2 minutes).** Create a dedicated
   community key with a credit limit that resets daily — OpenRouter enforces
   it server-side and 402s on its own, which the app maps to the same screen:

   ```bash
   # Management key from https://openrouter.ai/settings/management-keys
   curl -X POST https://openrouter.ai/api/v1/keys \
     -H "Authorization: Bearer $MANAGEMENT_KEY" \
     -H "Content-Type: application/json" \
     -d '{"name": "summon-community", "limit": 5, "limit_reset": "daily"}'
   ```

   `limit_reset` accepts `daily` / `weekly` / `monthly`; resets happen at
   midnight UTC. Put the returned `sk-or-v1-…` in `OPENROUTER_COMMUNITY_KEY`.
   With this in place even a Redis outage (budget fails open by design, same
   as the rate limiter) cannot overrun $5/day.

3. **Monitoring.** `GET https://openrouter.ai/api/v1/key` with the community
   key returns `{ limit, limit_remaining, limit_reset, usage_daily, … }`
   (`usage_daily` is per UTC day natively). Also: the OpenRouter activity
   dashboard, and `GET /api/usage` from anywhere.

## Cost levers (if the pool drains too fast)

1. **Regex-first URL detection** — the LLM pre-pass echoes the input back as
   output (expensive for long pastes); a regex catches ~99% of URLs for $0.
2. **Client-side image downscaling** before upload (vision tokens scale with
   resolution).
3. **Cheaper text-parse model** for plain-text inputs (e.g. ministral-class);
   keep mistral-large for images.
4. **Per-IP daily spend cap** (e.g. $0.50/IP/day) alongside the shared pool.
5. Raise/lower `DAILY_BUDGET_USD` — it's just an env var.

## Caveats

- **Race window:** concurrent requests near the cap can each pass the
  pre-check and overshoot by roughly one request (~$0.002–0.01). The upstream
  key limit bounds the absolute worst case.
- **Streaming:** `/api/parse` makes one non-streaming OpenRouter call and
  re-chunks it as SSE, so cost capture is exact there too.
- **Latency near the cap:** OpenRouter tightens billing checks when a key
  approaches its credit limit — expect slightly slower responses right before
  the limit trips.
