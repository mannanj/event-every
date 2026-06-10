### Task 189: D1 Worker proxy + community key minted — zero manual tokens
- [x] Worker `spirit-hammer-waitlist-proxy` deployed with a D1 binding scoped to the waitlist database; bearer-secret auth, fail-closed (503) until the secret exists, REST-identical response shape
- [x] `src/lib/d1.ts` prefers the proxy (`WAITLIST_D1_PROXY_URL`/`_SECRET`), keeps the REST-token path as fallback — no `CLOUDFLARE_D1_API_TOKEN` needed
- [x] Community OpenRouter key minted via Management API: `limit: 5`, `limit_reset: daily` (midnight UTC) — the hard upstream backstop
- [x] Live-verified: waitlist POST writes to D1 through the Worker; pending Redis signup (hello@mannan.is) drained into D1 with original timestamp; anonymous parse burned the community key (usage_daily 0.0009135 ≈ app meter 0.0009)
- [x] All three new env vars in Vercel production + development
- Location: `workers/waitlist-d1-proxy/`, `src/lib/d1.ts`, `.env.example`
