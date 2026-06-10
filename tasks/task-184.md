### Task 184: Spirit & Hammer waitlist (Cloudflare D1 + Resend)
- [x] D1 database `spirit-hammer-waitlist` (account `Hello@mannan.is`) with `waitlist` table; migration in `migrations/0001_waitlist.sql`
- [x] `POST /api/waitlist`: honeypot bot drop, email validation, 5-signups/IP/day rate limit, idempotent insert (`ON CONFLICT DO NOTHING`), Redis fallback store (`waitlist:pending:<email>`) so signups are never lost if D1 is unreachable
- [x] Resend confirmation email (plain fetch, no SDK) sent on first signup only; `email_sent` flag updated in D1
- [x] D1 REST client (`src/lib/d1.ts`) using `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_D1_DATABASE_ID` / `CLOUDFLARE_D1_API_TOKEN`
- [x] `.env.example` documents all new vars (budget, community key, D1, Resend)
- Location: `src/lib/d1.ts`, `src/app/api/waitlist/route.ts`, `migrations/0001_waitlist.sql`, `.env.example`
