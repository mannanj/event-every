# Event Every

Event everything. Flyer, screenshot, email, link — into a calendar event.

## What It Does

Event Every converts event information into reviewable calendar files:
- **Image to Event**: Scan a poster, flyer, or screenshot with the fixed vision adapter
- **Text to Event**: Scan pasted or typed details with the fixed text/link adapter
- **URL Enrichment**: Detect and scrape URLs on the host, then scan the resolved text
- **Review & Edit**: Confirm null-bearing Scanner claims and make explicit edits
- **Universal Export**: Generate fresh Scanner ICS bytes for selected review drafts

## Features

### Input Methods
- 📸 **Image Upload**: OCR extracts text from any image
- ✍️ **Text Input**: Direct entry for quick event creation

### Smart Event Generation
- 🤖 **Scanner Extraction**: Validates provider observations before creating event candidates
- 📅 **Date & Time Detection**: Recognizes various date/time formats
- 📍 **Location Extraction**: Finds venue names and addresses
- 📝 **Description Generation**: Creates meaningful event descriptions

### User Experience
- ⚫⚪ **Minimal Black & White UI**: Clean, distraction-free design
- ✅ **Confirmation View**: Review before saving
- ✏️ **Inline Editing**: Modify any field directly
- 📜 **Event History**: Access all past events via top-right toggle
- 💾 **Export Options**: Download in your preferred format

### Calendar Format Support
- **Apple Calendar** (.ics)
- **Google Calendar** (.ics)
- **Outlook** (.ics)

All formats use standard iCalendar format for universal compatibility.

## How It Works

1. **Input**: Upload one image or enter text; URLs are resolved by the host first
2. **Scan**: Event Every resolves an opaque source handle and calls the fixed Scanner adapter
3. **Validate**: Scanner validates the observation and returns null-bearing candidates and issues
4. **Review**: See the generated review drafts and their readiness state
5. **Edit**: Make explicit evidence-free human edits
6. **Export**: Generate and download fresh Scanner ICS bytes for the selected drafts

## UI Design Philosophy

**Minimal. Lovable. Complete.**

- Pure black and white aesthetic
- No clutter, no distractions
- Fast and responsive
- Intuitive navigation
- History toggle in top-right corner
- Simple confirmation and editing interface

## Scanner Boundary

Event Every consumes the private local package `@event-every/scanner` version `0.0.0`, vendored
from Event Scanner commit `c03cf1a79d0d1f2151ee602d67aa0a2eede673e4`. Exact pack integrity,
artifact digests, file inventory, and tool versions are recorded in
`vendor/event-every-scanner/PROVENANCE.json`. Refresh from an exact clean Scanner checkout with:

```bash
bun run vendor:scanner /absolute/path/to/event-scanner
```

Scanner fixes the provider roles and model IDs: text and host-resolved link content use
`deepseek/deepseek-v4-flash`; images use `mistralai/mistral-small-2603`. Callers cannot override
those IDs. `OPENROUTER_MODEL` remains only for Event Every's separate host-side URL-detection route;
it does not configure Scanner.

Event Every owns credentials, rate and budget policy, opaque source-handle resolution, URL
fetch/scrape policy, request charging, browser state, and downloads. Scanner owns observation
validation, null-bearing candidates and issues, readiness calculation, and fresh ICS generation.
Only the server-side source resolver sees raw scan text or image data. Raw material is retained only
for the request lifetime and neither raw input nor provider bodies cross the API response boundary.

Scanner review localStorage is raw-free: it stores bounded candidate claims, issues, opaque source
metadata, explicit edits, and identity policy values—never request objects, images, provider
prompts/bodies, keys, or cached ICS. The existing **Recent input** feature is separate and unchanged;
it intentionally stores user input/file DTOs in IndexedDB for its user-visible history workflow.
The saved-history CalendarEvent exporter still uses the `ics` package and is not the Scanner review
export path.

## Offline Verification

`bun run verify:e1:offline` blanks credential-pattern environment values, installs an egress-blocking
preload, verifies the contained Scanner package, and runs unit, lint, type, build, Chromium, and
WebKit gates without provider access. `bun run assert:e1-paths
4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD` enforces the E1 path and terminal-boundary audit;
`bun run assert:e1-protected` verifies protected user paths.

E1 covers separate text or image scanning, host URL enrichment, review/edit, and single/multiple
Scanner ICS export. Mixed text+image scanning, Scanner-native link capture, email/private capture,
browser or on-device models, deduplication, Calendar Casa integration, Cloudflare/D1/R2 migration,
production deployment, and legacy-infrastructure retirement remain deferred to later program gates.

## Community Access & Budget

The app is open to everyone — no pattern lock. Anonymous usage shares a daily
community budget (`DAILY_BUDGET_USD`, default $5, resets midnight UTC) metered
from OpenRouter's exact per-request `usage.cost` in Upstash Redis. When the
pool is spent, visitors see the community-sponsored limit screen with the
reset time in their own timezone, a Spirit & Hammer collective waitlist signup
(saved to Cloudflare D1, confirmed via Resend), and an "Enter pattern lock"
link. A valid pattern unlock switches the session to the unrestricted admin
key (`/?unlock` opens the pattern screen directly).

Endpoints: `GET /api/usage` (budget status), `POST /api/waitlist` (signup).
Preview the limit screen anytime at [`/spent`](https://www.summonit.app/spent)
(fully functional, doesn't touch the real budget).
Full numbers and levers: [docs/cost-analysis.md](docs/cost-analysis.md).

| Env var | Purpose |
|---|---|
| `DAILY_BUDGET_USD` | Community pool per UTC day (default 5) |
| `OPENROUTER_COMMUNITY_KEY` | Optional dedicated key for community traffic (recommended: $5 limit, daily reset) |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_D1_DATABASE_ID` / `CLOUDFLARE_D1_API_TOKEN` | Waitlist D1 over REST |
| `RESEND_API_KEY` / `RESEND_FROM` | Waitlist confirmation emails (verified domain required) |

## Getting Started

### Quick Start

```bash
./run.sh
```

This script handles everything: installs dependencies, pulls environment variables from Vercel, and starts the dev server.

### Manual Setup

```bash
bun install            # Install dependencies
vercel link            # Link to Vercel project (first time only)
vercel env pull        # Pull env variables to .env.local
bun dev                # Start dev server
```

### Requirements

- [Bun](https://bun.sh/) (v1.0+)
- [Vercel CLI](https://vercel.com/cli) (`bun install -g vercel`)

## Contributing

Contributions welcome! Please submit issues and pull requests.

## License

MIT

---

Built with simplicity in mind.
