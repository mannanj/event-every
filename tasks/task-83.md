### Task 83: Fix Daily Limit Card Progress Bar and Visibility
- [x] Fix progress bar proportions to correctly calculate percentage based on capacity of 100
- [x] Ensure progress bar stays within container boundaries
- [x] Only show daily limit card when remaining events < 10
- [x] Verify progress bar visual accuracy at different usage levels
- Location: `src/components/RateLimitBanner.tsx`, `src/app/api/parse/route.ts`, `src/lib/ratelimit.ts`
