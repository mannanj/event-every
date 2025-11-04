### Task 28: Rate Limiting Infrastructure
- [x] Set up rate limiting infrastructure (Vercel KV instead of Upstash Redis)
- [x] Implement rate limiting in API routes (track requests per IP, 5 events/day)
- [x] Add UI feedback for rate limit states (remaining uses, reset timer)
- [x] Test protection features locally
- Location: `src/lib/ratelimit.ts`, `src/components/RateLimitBanner.tsx`, `src/app/api/parse/route.ts`, `src/app/page.tsx`

**Implementation Notes:**
- Used Vercel KV (@vercel/kv) for serverless-friendly rate limiting
- Rate limiting applied to event parsing API (5 events per day per IP)
- Rate limit info displayed in fixed top-right banner
- Graceful degradation when KV not configured (allows unlimited during development)
- Production deployment requires Vercel KV environment variables to be set
