### Task 185: Open the app — community limit screen replaces the pattern lock
- [x] App renders for everyone by default (no pattern lock gate); a valid pattern cookie silently upgrades the session to admin
- [x] Full-screen community limit view when the daily budget is spent: "This app is community sponsored. The usage limits have been hit today and reset <date+time in the visitor's browser timezone, zone listed>."
- [x] Spirit & Hammer waitlist signup on the limit screen with on-screen confirmation after the email is saved/sent
- [x] Blue "Enter pattern lock" link below the waitlist that returns to the pattern screen exactly as it looked before; success goes straight into the app on the unrestricted key
- [x] Limit screen triggers on load (`/api/usage`) and mid-session (community-limit 402 event); `/?unlock` opens the pattern screen directly for admins
- [x] Playwright coverage: message + local reset time, waitlist confirmation, already-joined, pattern link, open-by-default, admin bypass, mid-session 402 flip
- Location: `src/components/AuthWrapper.tsx`, `src/components/CommunityLimitScreen.tsx`, `e2e/community-limit.spec.ts`
