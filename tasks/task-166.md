### Task 166: ICS Image Attachments — Three Approaches

**Problem**: Image attachments in exported ICS files don't work in any major calendar client.

- Inline base64 `ATTACH` is ignored by Google Calendar, breaks Outlook, and only shows as a downloadable file (never inline) on Apple Calendar macOS
- Base64 attachments bloat ICS files (a single screenshot makes an 8-event export 3MB+)
- Current approach duplicates all attachment data into localStorage, which has a 5-10MB quota
- No image hosting infrastructure exists in the project today

**Current attachment flow**: Image → FileReader → base64 string → EventAttachment object → stored in localStorage with event → embedded as base64 in ICS export

---

## Approach A: Host Images on Cloudflare R2 + URL-Based ATTACH

Upload images to Cloudflare R2 (or Vercel Blob), generate public URLs, and reference those URLs in ICS exports via both the `ATTACH` property and the event description.

### Why Cloudflare R2
- 10 GB free storage (~10,000 images)
- **Zero egress fees** (every calendar client fetching the image URL = free)
- Public URLs via `r2.dev` subdomain or custom domain
- S3-compatible API (well-documented, stable)

### Implementation Steps

- [ ] **1. Set up Cloudflare R2 bucket**
  - Create R2 bucket in Cloudflare dashboard
  - Enable public access via custom domain or `r2.dev`
  - Generate API credentials (Account ID, Access Key ID, Secret Access Key)
  - Add credentials to Vercel environment variables
  - Location: Cloudflare dashboard, Vercel dashboard

- [ ] **2. Remove `output: 'export'` from Next.js config**
  - Current static export mode prevents API routes from working at runtime
  - Change to standard Next.js SSR/serverless deployment
  - Verify existing API routes (`/api/parse`, `/api/scrape-url`, etc.) still work
  - Location: `next.config.js`

- [ ] **3. Create image upload API route**
  - `POST /api/upload-image` — accepts base64 image, uploads to R2, returns public URL
  - Use `@aws-sdk/client-s3` (R2 is S3-compatible) for upload
  - Generate unique keys: `attachments/{eventId}/{timestamp}-{filename}`
  - Return the public URL for the uploaded image
  - Add rate limiting to prevent abuse
  - Location: `src/app/api/upload-image/route.ts`

- [ ] **4. Update attachment creation flow**
  - After image is captured as base64, upload to R2 via the new API route
  - Store the returned URL in a new `url` field on `EventAttachment`
  - Keep base64 `data` for in-app display but store URL for export
  - Update `EventAttachment` interface to add optional `url?: string` field
  - Location: `src/types/event.ts`, `src/app/page.tsx`

- [ ] **5. Update ICS exporter to use URL-based ATTACH**
  - If attachment has a `url`, use: `ATTACH;FMTTYPE=image/png:https://r2.example.com/image.png`
  - Also append the image URL to the event description as a universal fallback
  - Fall back to base64 format if no URL available (offline/upload failure)
  - Stop embedding base64 in ICS when URL is available (keeps files small)
  - Location: `src/services/exporter.ts`

- [ ] **6. Reduce localStorage pressure**
  - Once images are hosted on R2, store only the URL + metadata in localStorage (not full base64)
  - Keep base64 temporarily for display until upload confirms
  - Location: `src/services/storage.ts`, `src/app/page.tsx`

### Compatibility Matrix (with this approach)

| Client              | ATTACH URL    | Description link | Result                     |
|---------------------|---------------|------------------|----------------------------|
| Apple Calendar macOS| Downloadable  | Clickable        | Image accessible both ways |
| Apple Calendar iOS  | Ignored       | Clickable        | Image accessible via link  |
| Google Calendar     | Stripped       | Clickable        | Image accessible via link  |
| Outlook             | Unreliable    | Clickable        | Image accessible via link  |

### Pros
- ICS files stay small (~1KB per event vs ~400KB+ with base64)
- Image URL in description works universally across all calendar clients
- Apple Calendar macOS users get a proper downloadable attachment
- Reduces localStorage pressure significantly
- Images persist beyond browser storage (cloud-hosted)
- Foundation for future features (sharing events, multi-device sync)

### Cons
- Requires Cloudflare account setup and API credentials
- Adds infrastructure dependency (R2 service)
- Needs `output: 'export'` removal (changes deployment model)
- Upload failures need graceful handling
- Privacy consideration: user images are now stored on a third-party cloud
- Ongoing cost potential if exceeding free tier (unlikely for small app)

### Estimated complexity: Medium-High
### New dependencies: `@aws-sdk/client-s3`

---

## Approach B: Strip Attachments from ICS + Keep In-App Only

Remove image attachments from ICS exports entirely. Keep images stored in-app for reference. Add the event's source context to the ICS description so users know where the event came from.

### Rationale
- No major calendar client renders ICS image attachments inline
- Base64 attachments bloat ICS files and can break Outlook imports
- The original image is already accessible in the app's event history
- The real value of the image was in parsing the event — once parsed, the image has served its purpose

### Implementation Steps

- [ ] **1. Remove attachment embedding from ICS export**
  - In `exportToICS()`: stop passing attachments to `addAttachmentsToICS`
  - In `exportMultipleToICS()`: stop passing attachments to `addAttachmentsToICSAtIndex`
  - Remove or keep the helper functions (for potential future use)
  - Location: `src/services/exporter.ts`

- [ ] **2. Enrich ICS description with source context**
  - If event was created from an image, append to description: `"\n\nCreated from image: {filename}"`
  - If event has a URL (like `meet.google.com/...`), it's already in the ICS `URL` field
  - If event was created from a URL source, append: `"\n\nSource: {originalInput}"`
  - Location: `src/services/exporter.ts`

- [ ] **3. Add "View original" feature in app history**
  - Attachments remain stored in localStorage with events
  - Ensure the event history UI clearly shows the original image/text attachment
  - Users can always return to the app to view the source material
  - Location: `src/components/EventConfirmation.tsx`, `src/components/InlineEventEditor.tsx`

- [ ] **4. Update batch/zip export to include images separately**
  - The existing zip export (`exportAll.ts`) already bundles images as separate files
  - Verify this still works correctly and images are properly included
  - This gives users a way to get their images alongside ICS files
  - Location: `src/services/exportAll.ts`

### Compatibility Matrix (with this approach)

| Client              | ICS Import     | Image Access              |
|---------------------|----------------|---------------------------|
| Apple Calendar macOS| Clean import   | Via app history or zip    |
| Apple Calendar iOS  | Clean import   | Via app history or zip    |
| Google Calendar     | Clean import   | Via app history or zip    |
| Outlook             | Clean import   | Via app history or zip    |

### Pros
- Zero infrastructure changes — no new services, accounts, or dependencies
- ICS files are small and import cleanly on all clients
- No risk of breaking imports (Outlook base64 issue eliminated)
- No privacy concerns (images stay local)
- No ongoing costs
- Simple to implement (< 1 hour)
- Zip export already provides images alongside ICS files

### Cons
- Images are not associated with calendar events in any calendar client
- Users lose image context once they leave the app
- Images are still stored in localStorage (quota pressure remains)
- No path to sharing or cloud backup of images
- Less feature-rich than Approach A

### Estimated complexity: Low
### New dependencies: None

---

## Approach C: Direct Calendar API Integration (Bypass ICS)

Instead of exporting ICS files for users to manually import, connect directly to calendar platform APIs to create events with native attachment support. This eliminates the ICS format limitations entirely.

### Platform Research Summary

| Platform | Attachment Support | Auth Method | Complexity | Verdict |
|----------|-------------------|-------------|------------|---------|
| **Google Calendar API** | Yes, but Google Drive files only | OAuth 2.0 (Calendar + Drive scopes) | High | Viable but complex — must upload to Drive first, then attach |
| **Microsoft Graph API** | Excellent — direct base64 upload | OAuth 2.0 (Calendars.ReadWrite) | Medium | Best native attachment support of any platform |
| **Apple CalDAV** | Unknown — RFC 8607 managed attachments undocumented for iCloud | Basic Auth (app-specific passwords) | High | Terrible UX — no OAuth, users must generate passwords manually |

### Option C1: Implement Google + Microsoft APIs Directly

Build OAuth flows and API integrations for each platform individually.

**Google Calendar flow** (requires googleapis npm package):
1. User clicks "Add to Google Calendar" → OAuth consent screen
2. App uploads image to Google Drive via Drive API
3. App creates calendar event with Drive file reference via Calendar API
4. Scopes needed: `calendar` + `drive.file`
5. Apps with >100 users need Google's OAuth verification process

**Microsoft Graph flow** (requires @microsoft/microsoft-graph-client):
1. User clicks "Add to Outlook" → Microsoft OAuth consent
2. App creates calendar event via Graph API
3. App attaches image directly as base64 (no intermediate storage needed)
4. Scope needed: `Calendars.ReadWrite`
5. Requires Azure app registration (free)

**Apple**: Skip entirely — no OAuth, requires users to generate app-specific passwords at appleid.apple.com. Unacceptable UX. Apple users would fall back to ICS export.

#### Implementation Steps

- [ ] **1. Add NextAuth.js with Google + Microsoft providers**
  - Configure OAuth for both platforms with calendar-specific scopes
  - Store refresh tokens securely (encrypted in DB or Vercel KV)
  - Handle token refresh, expiration, and revocation
  - Location: `src/app/api/auth/[...nextauth]/route.ts`, new auth config

- [ ] **2. Remove `output: 'export'` from Next.js config**
  - Required for server-side API routes and OAuth callbacks
  - Location: `next.config.js`

- [ ] **3. Build Google Calendar integration**
  - `POST /api/calendar/google/create-event` — creates event + uploads image to Drive + attaches
  - Handle Drive upload, file permission sharing, event creation in a single flow
  - Dependencies: `googleapis`
  - Location: `src/app/api/calendar/google/`

- [ ] **4. Build Microsoft Graph integration**
  - `POST /api/calendar/microsoft/create-event` — creates event + attaches image directly
  - Simpler than Google (no intermediate Drive step)
  - Dependencies: `@microsoft/microsoft-graph-client`
  - Location: `src/app/api/calendar/microsoft/`

- [ ] **5. Update UI with "Add to Calendar" buttons**
  - Replace or supplement the ICS download button with platform-specific buttons
  - Show "Connect Google Calendar" / "Connect Outlook" if not yet authenticated
  - Show "Added to Google Calendar" confirmation on success
  - Keep ICS download as fallback for Apple and unconnected users
  - Location: `src/components/ExportOptions.tsx`

- [ ] **6. Google OAuth app verification**
  - If app exceeds 100 users, submit for Google's verification process
  - Requires: privacy policy, terms of service, homepage, demo video
  - Timeline: 2-6 weeks for review

#### Pros
- Events appear directly in user's calendar (no manual import step)
- Microsoft Graph supports real image attachments natively
- Google supports attachments via Drive (visible in event)
- Best possible UX for connected users
- Foundation for two-way sync features in the future

#### Cons
- **6-12 weeks of engineering** for a single developer (2-4 weeks per platform)
- OAuth token management adds significant complexity and security responsibility
- Google requires Drive API too (doubles the API surface)
- Apple users get no benefit — still fall back to ICS
- Google app verification process required at scale
- Ongoing maintenance: API changes, token refresh bugs, scope deprecations
- Completely changes the app's architecture from static to server-dependent

#### Estimated complexity: Very High
#### New dependencies: `googleapis`, `@microsoft/microsoft-graph-client`, `next-auth`

### Option C2: Use Nylas Unified Calendar API

Use a third-party calendar API abstraction service to handle Google, Microsoft, and Apple in a single integration.

**How Nylas works**:
- Single API to create events across Google Calendar, Outlook, and iCloud
- Nylas handles OAuth, token management, and platform differences
- Your app talks to Nylas → Nylas talks to calendar providers
- Attachment support depends on underlying provider capabilities

#### Implementation Steps

- [ ] **1. Set up Nylas account and application**
  - Create Nylas developer account
  - Configure Google, Microsoft, and Apple calendar connectors
  - Get API key and client credentials
  - Free tier: 5 connected accounts (for development/testing)
  - Location: Nylas dashboard

- [ ] **2. Remove `output: 'export'` from Next.js config**
  - Location: `next.config.js`

- [ ] **3. Build Nylas integration**
  - `POST /api/calendar/connect` — initiates Nylas hosted auth flow
  - `POST /api/calendar/create-event` — creates event via Nylas API with attachment
  - Single endpoint works for all providers
  - Dependencies: `nylas` npm package
  - Location: `src/app/api/calendar/`

- [ ] **4. Update UI with unified "Add to Calendar" flow**
  - Single "Add to Calendar" button → Nylas auth picker (user chooses provider)
  - Once connected, events are pushed directly to their calendar
  - Keep ICS download as an alternative option
  - Location: `src/components/ExportOptions.tsx`

#### Pricing
- **Free sandbox**: 5 connected accounts (development only)
- **Production**: ~$1-2 per connected account per month
- Cronofy alternative: $819/month minimum (not viable for indie app)

#### Pros
- Single integration covers Google, Microsoft, and Apple
- Nylas handles OAuth, token refresh, and platform quirks
- Much faster to implement than C1 (days vs weeks)
- Reduces maintenance burden significantly

#### Cons
- **Ongoing cost**: ~$1-2/user/month at scale
- Vendor dependency — if Nylas changes pricing or shuts down, you're stuck
- Free tier is sandbox-only (5 accounts), need paid plan for production
- Attachment support varies by provider (Apple still limited)
- Adds latency (your app → Nylas → calendar provider)
- Privacy: user calendar data flows through a third party

#### Estimated complexity: Medium
#### New dependencies: `nylas`

---

## Recommendation

**Ship Approach B now** — strip base64 attachments from ICS, enrich descriptions with source context. Takes < 1 hour, eliminates broken exports and bloated files. This should happen regardless of which long-term approach is chosen.

**For long-term image persistence**, choose between:

| If you want... | Choose |
|----------------|--------|
| Quick win, images accessible via link in all calendar clients | **Approach A** (R2 + URL ATTACH) |
| Zero-import UX, events appear directly in calendars | **Approach C1** (direct APIs) or **C2** (Nylas) |
| Fastest path to direct calendar integration | **Approach C2** (Nylas) |
| Full control, no vendor dependency | **Approach A** or **Approach C1** |

The approaches layer naturally: **B → A → C**. Each builds on the previous without throwing away work.

---

## Success Criteria

- [ ] Task file `tasks/task-166.md` created with three clearly defined approaches
- [ ] Each approach includes: implementation steps, compatibility matrix, pros/cons
- [ ] Approach C covers both DIY (C1) and unified service (C2) options
- [ ] Approaches are actionable with specific file locations and changes
- [ ] Recommendation provided for sequencing
