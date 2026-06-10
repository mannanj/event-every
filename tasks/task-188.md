### Task 188: Resend wired live — idempotent sends from waitlist@mannan.is
- [x] Resend key validated (sending-only scope) and live send verified from `Spirit & Hammer <waitlist@mannan.is>` (mannan.is is verified in Resend)
- [x] `Idempotency-Key: waitlist-confirmation/<email>` on the confirmation send — retries within 24h can't double-send
- [x] End-to-end route test: POST /api/waitlist → save → real Resend send → `{ ok: true, emailSent: true }`
- [x] `RESEND_API_KEY` + `RESEND_FROM` set in `.env.local` and pushed to Vercel
- Location: `src/app/api/waitlist/route.ts`
