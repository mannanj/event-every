### Task 192: Events from email — forward-to-address + connected-inbox

Let people turn emails into calendar events without leaving their mailbox. Two onboarding
paths, one shared parsing pipeline:

1. **Forward-to-address (no inbox access)** — sign up, get a personal inbound address
   (`you-<token>@in.eventevery.com`). Forward or send any email there; we parse it into an
   event and deliver a ready `.ics` (reply + saved to history). Zero calendar permissions.
2. **Connected inbox (read access)** — sign in and link your email (Gmail OAuth first). We
   watch for incoming mail, detect event-shaped messages, and surface a one-click "Add event"
   without you forwarding anything.

Both paths converge on the existing OpenRouter parser and the existing `.ics` exporter — email
is just a new **Input** source feeding the same Extract → Parse → Review → Export flow. Keep the
black/white + rainbow identity; reuse the community-key + D1 backstops already in place.

#### Accounts (prerequisite — minimal, email-first)
- [ ] Lightweight account model: email + magic-link sign-in (reuse Resend for the link send; no passwords)
- [ ] Session store in D1 via the existing Worker proxy (no new manual tokens); httpOnly cookie session
- [ ] `CalendarEvent` gains `source: 'email'` and `sourceEmail?: { from, subject, receivedAt }`
- Location: `src/app/api/auth/*`, `src/lib/d1.ts`, `src/types/event.ts`

#### Path 1 — Forward-to-address (inbound parsing)
- [ ] Provision inbound domain `in.eventevery.com` in Resend; verify MX/SPF/DKIM (see `email-best-practices` skill)
- [ ] On signup, mint a per-user inbound token → stable address; store mapping in D1
- [ ] Inbound webhook (`/api/inbound/email`) — verify Resend signature, resolve token → user, reject unknown/unsigned
- [ ] Normalize the message: prefer text body, strip quoted replies/signatures, fall back to HTML→text; OCR inline image attachments through the existing OCR path
- [ ] Run normalized content through the existing parser; build the event server-side
- [ ] Deliver result: reply email with the `.ics` attached + a deep link to review/edit; persist to the user's history (D1) so it shows in **Recent**
- [ ] Rate-limit per user; route anonymous/over-limit through the existing community-key backstop and limit screen copy
- Location: `src/app/api/inbound/email/route.ts`, `src/services/parser.ts`, `src/services/ocr.ts`, `src/services/exporter.ts`, `workers/*`

#### Path 2 — Connected inbox (Gmail OAuth)
- [ ] Google OAuth (read-only `gmail.readonly`) — consent screen, token exchange, encrypted refresh-token storage in D1
- [ ] Gmail watch via Pub/Sub push (preferred) with a polling fallback; incremental history sync, dedupe by message id
- [ ] Cheap pre-filter (heuristics) before spending a parse call; only event-shaped mail reaches the parser
- [ ] Surface detections in-app as pending cards: review → edit → export/save, never auto-create silently
- [ ] Disconnect flow: revoke token, purge stored mail metadata
- Location: `src/app/api/connect/google/*`, `src/services/gmail.ts`, `src/services/parser.ts`

#### UI
- [ ] Landing: a third onboarding affordance beside image/text — "Email it" — showing the user's
      forwarding address (copy button) and a "Connect inbox" option, in the existing recede-on-start block
- [ ] Account/settings surface: forwarding address, connected inboxes, disconnect, per-source history
- [ ] Pending-detection cards reuse `EventConfirmation`/`EventEditor`; black/white + rainbow accent only
- Location: `src/app/page.tsx`, `src/components/landing/*`, `src/components/*`, `src/app/globals.css`

#### Quality & verification
- [ ] Inbound webhook signature verification covered by tests (valid, tampered, unknown-token)
- [ ] Parser tests extended with real email shapes: forwarded chains, calendar invites (`.ics`/`text/calendar`), HTML-only, multi-event digests
- [ ] Privacy: document what's stored vs. dropped for each path; connected-inbox stores metadata + derived events, not full bodies
- [ ] `.ics` round-trips on Apple/Google/Outlook (per CLAUDE.md export checklist)
- [ ] type-check + production build pass; magic-link, forward-to-address, and Gmail-connect flows verified end-to-end

#### Open decisions (resolve before building)
- [ ] Inbound provider: stay on **Resend inbound** (already integrated) vs. Cloudflare Email Routing → Worker
- [ ] Connected-inbox scope at launch: Gmail only, or also Outlook/Microsoft Graph
- [ ] Whether forwarded results auto-add to the user's calendar (if connected) or always stop at review

- Location: `src/app/api/*`, `src/services/*`, `src/types/event.ts`, `workers/*`, `src/components/*`

[Task-192]
