### Task 254: One reading path for the site's input and the embedded one; a photo keeps the link typed beside it
- [x] `src/services/readSources.ts` - the reading steps as one module: `readText` (find links -> fetch
  pages -> triage -> one scan or split scans), `readLinks`, `linkForPhotos`, `withTypedLink`. The site's
  page (`src/app/page.tsx`, browser transport in `siteReadSteps.ts`) and the MCP route (server transport)
  both run it, so the two inputs cannot read the same box differently.
- [x] Bug (site and embedded input): a photo with words beside it dropped the words - `page.tsx` read text
  only when there were no images, and the embedded input sent a pasted photo the instant it landed. Now
  the words' links are fetched and a photo's event takes its link from them.
- [x] `src/utils/videoCall.ts` - a join link that lands on a call (Luma `/join/` -> Google Meet, bounced to
  `/unsupported?ref=`) gives the call's room. `buildEnrichedUrlText` keeps that as "Video call link:" for
  the model when the source does not already name it.
- [x] Server halves of the browser routes, shared with them: `triageForScan` (/api/triage) and
  `readResolvedPage` / `scrapePage` (/api/scrape-url).
- [x] `/api/mcp/scan` kind `input` + MCP tool `read_into_events({ text, images[] })`; every MCP scan now
  applies the same typical-duration rule as the page (verification's guess, else triage's).
- [x] `packages/event-every-input`: one `EventEveryInput { text, images, calendars }`; files are held as
  chips until the box is sent, as on the site; photos shrink to the site's 1024 px ceiling first
  (`SCAN_IMAGE_MAX_EDGE`, now shared with `utils/imageDownscale.ts`); an expand button opens it full size.
- [x] `scripts/probe-read.ts` - the reading path against the real fetcher, triage and model. Run
  2026-10-12 on a Luma join link + its event screenshot: the event comes back with
  `url: https://meet.google.com/tye-iekt-ttn` (before: no link).
- [x] Tests: `src/services/__tests__/readSources.test.ts`; package tests rewritten for `collectInput`.
- Location: `src/services/readSources.ts`, `src/app/page.tsx`, `src/app/api/mcp/scan/route.ts`, `mcp/src/tools.ts`, `packages/event-every-input`
