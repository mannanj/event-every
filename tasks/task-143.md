### Task 143: Add Rate Limiting to All API Routes
- [ ] Audit existing API routes for rate limiting coverage
- [ ] Add rate limiting middleware to `/api/events` route
- [ ] Add rate limiting to `/api/detect-urls` route
- [ ] Add rate limiting to `/api/scrape-url` route
- [ ] Add rate limiting to `/api/auth/verify` route
- [ ] Document rate limits in API responses and error messages
- Location: `src/app/api/events/route.ts`, `src/app/api/detect-urls/route.ts`, `src/app/api/scrape-url/route.ts`, `src/app/api/auth/verify/route.ts`
