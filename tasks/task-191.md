### Task 191: Rebrand to Event Every + one-page landing redesign

Drop the "Summon" rebrand, return to **Event Every**, and rebuild the home page as a
single-page landing where the input is the hero. Keep the black/white + rainbow identity;
add read-along's smooth, professional polish (ambient glow, fade-up entrances, offset
shadows, calm tracked labels, a recede-on-start marketing block). CSS-only motion.

- [x] Rename user-facing "Summon" → "Event Every" (services, API headers, export filenames, waitlist email, README, docs)
- [x] `layout.tsx` metadata → Event Every title + description
- [x] `page.tsx`: editorial hero — "Event everything." headline, input as centerpiece with offset shadow + staggered entrance
- [x] Marketing sections (How it works · trust · FAQ · footer) that recede when work starts
- [x] `globals.css`: rainbow-flow accent, ambient brand glow, fade-up stagger, eyebrow labels, offset shadow, FAQ accordion, reduced-motion guards; rainbow bg refined to a hero halo that fades to white
- [x] `landing/LandingSections.tsx`: SiteNav, HowItWorks, TrustPoints, Faq, SiteFooter
- [x] "Recent summons" → "Recent" across UI; loading copy de-branded ("Pulling event details…")
- [x] `CommunityLimitScreen` wordmark → Event Every
- [x] Keep IndexedDB name stable (no user data loss); internal event constant de-branded
- [x] Update e2e suite labels to match new strings (tests key off data-testid — unaffected)
- [x] type-check + production build pass; visual verification (desktop, mobile, limit, started/recede)

- Location: `src/app/page.tsx`, `src/app/globals.css`, `src/app/layout.tsx`, `src/components/landing/LandingSections.tsx`, `src/components/*`, `src/services/*`, `src/app/api/*`, `e2e/*`

[Task-191]
