### Task 28: Rate Limiting Infrastructure
- [ ] Set up rate limiting infrastructure (Upstash Redis free tier)
- [ ] Implement rate limiting middleware (track requests per IP, 5 events/day)
- [ ] Add UI feedback for rate limit states (remaining uses, reset timer)
- [ ] Test protection features locally
- Location: `src/middleware.ts`, `src/lib/ratelimit.ts`, `src/components/RateLimitBanner.tsx`
