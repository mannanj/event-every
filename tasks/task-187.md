### Task 187: /spent — live preview of the community limit screen
- [x] `/spent` renders the exact CommunityLimitScreen (real reset time from `/api/usage`, working waitlist form, working pattern-lock link) without touching the real budget
- [x] Mount-gated rendering so the reset time always formats in the visitor's timezone, never the server's
- [x] "Enter pattern lock" navigates to `/?unlock` (existing admin entry point)
- [x] Playwright coverage: preview renders while budget is NOT exhausted; pattern link lands on the pattern screen
- Location: `src/app/spent/page.tsx`, `e2e/community-limit.spec.ts`, `README.md`
