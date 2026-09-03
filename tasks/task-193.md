### Task 193: Minimal "send us a message" — footer contact link → Resend

Give visitors a quiet way to reach us without touching the minimal feel of the app.
**No new weight above the fold.** A single "Contact" link in the existing footer opens a
small modal (same black/white styling as `EmailRequestModal`) with email + message fields.
Submitting POSTs to a new `/api/contact` route that emails us via Resend. The footer already
recedes once work starts, so the affordance disappears the moment someone's actually using
the tool. Reuse, don't reinvent — the send/rate-limit/validation/spam patterns already exist
in `api/waitlist/route.ts`.

#### API — `/api/contact`
- [ ] New `src/app/api/contact/route.ts`, modeled on `api/waitlist/route.ts`
- [ ] Validate: email (reuse the `EMAIL_RE` shape) + non-empty message (cap length, e.g. ≤ 4000 chars)
- [ ] Send to us via Resend (same client/from-domain the waitlist send uses); subject `"Event Every — message from <email>"`, reply-to set to the sender
- [ ] Spam protection: honeypot fields (mirror `EmailRequestModal`'s `website`/`phone`/`email` traps) + per-IP/day rate-limit via existing Upstash helper (`getClientIP`, `overSignupLimit` pattern)
- [ ] Optional persistence: if `isD1Configured()`, insert into a `contact_messages` table (email, message, user_agent, created_at); degrade gracefully if D1/Redis absent (email send is the source of truth)
- [ ] Return user-friendly JSON only — never leak Resend/D1 errors to the client (per CLAUDE.md error handling)
- Location: `src/app/api/contact/route.ts`, `src/lib/d1.ts`, `src/lib/clientIp.ts`

#### UI — footer link + modal
- [ ] Add a "Contact" link to `SiteFooter()` beside the existing footer items (LandingSections.tsx:122)
- [ ] New `src/components/ContactModal.tsx` reusing `EmailRequestModal` styling (black/white, `border-2 border-black`, honeypots, `×` close, ARIA label); fields: email + message; submit → `/api/contact`
- [ ] States: idle → sending → success ("Thanks — we'll be in touch") → error (retry). No technical messages.
- [ ] Keyboard + screen-reader accessible (focus trap, Esc to close, labelled inputs); mobile-friendly
- [ ] Black & white only — no new gradient/accent; nothing rendered above the fold or in the hero
- Location: `src/components/landing/LandingSections.tsx`, `src/components/ContactModal.tsx`

#### Quality & verification
- [ ] Validation tests: missing/invalid email, empty message, over-length message, honeypot-filled (silently dropped), over-rate-limit
- [ ] Resend send mocked in tests; verify reply-to + subject formatting
- [ ] Manual: submit from footer modal → message lands in inbox with correct reply-to; success + error states render
- [ ] type-check + production build pass; verify the hero/minimal layout is visually unchanged with the link present

#### Open decisions (resolve before building)
- [ ] Destination address for messages (which inbox the Resend send goes to)
- [ ] Persist to D1 too, or email-only (default: email-only unless we want a searchable record)
- [ ] Auto-reply confirmation to the sender, or none (default: none — keep it minimal)

- Location: `src/app/api/contact/route.ts`, `src/components/ContactModal.tsx`, `src/components/landing/LandingSections.tsx`, `src/lib/d1.ts`, `src/lib/clientIp.ts`

[Task-193]
