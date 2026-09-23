### Task 249: Continue on the consent page works in a real browser
- [x] Reproduced: Chromium and WebKit both land on 403 origin_not_allowed after clicking Continue in production
- [x] Cause: the consent page's `Referrer-Policy: no-referrer` makes browsers send `Origin: null` on its own form POST, which edge admission refuses
- [x] Fix in the shared package (`same-origin`), synced into this app only
- [x] `mcp/scripts/verify-consent-browser.mjs`: clicks through in both engines, because the fetch-driven live check sends no Origin and could never see this
- [x] `verify-oauth-live.mjs` unescapes the second consent action too (the page now `&amp;`-encodes it), so the full chain passes again: 37/37 against production
- Location: `src/vendor/mcp-connector/consent.ts`, `mcp/scripts/verify-consent-browser.mjs`
