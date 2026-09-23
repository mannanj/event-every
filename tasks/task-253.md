### Task 253: Seeing and disconnecting one assistant at a time
- [x] Worker: `mcp/src/connections.ts` (`handleConnections`) - `GET /connections` lists the account's
  grants via `env.OAUTH_PROVIDER.listUserGrants(sub)` (paged, re-checking `userId` on every row),
  named through `lookupClient`, newest first; `DELETE /connections/:id` calls `revokeGrant(id, sub)`
  and answers the same whether or not the id existed. Authorized by a bearer `signActor` token under
  a new purpose, `ee.mcp.manage.v1` (60s), domain-separated from GRANT/ACTOR/REVOKE the same way every
  assertion in `grant.ts` already is. `/revoke` (disconnect everything) is unchanged.
- [x] App: `src/app/api/mcp/connections/route.ts` - GET + DELETE, session required (401), 503 when MCP
  is not configured, 502 when the Worker fails. DELETE takes `?id=` in the query string rather than a
  JSON body, because this route carries no body at all (0 bytes), which is what lets one path serve
  both GET and DELETE without a media-type check in the way.
- [x] `src/platform/route-manifest.ts` gained a `methods` field so one path can admit more than one
  verb (only `/api/mcp/connections` needs it); `admission.ts` and the manifest's own test were updated
  to match.
- [x] UI: re-synced the vendored `mcp-connector` package (McpConnector now draws its own "Connected"
  section from a `connections` prop). `SiteHeader.tsx` passes stable `load`/`disconnect` functions into
  the panel only when signed in. `AccountBar.tsx` no longer has a `disconnect` prop, a `disconnect`
  view, or a "Disconnect MCP" menu line - "MCP Connector" is the only line above Sign out.
  `/api/mcp/disconnect` and `/revoke` are untouched and still reachable, just unused by this UI.
- [x] Tests: `mcp/src/__tests__/connections.test.ts` (Worker), `src/app/api/mcp/connections/__tests__/route.test.ts`
  (app route: 401, 503, list, delete, bad id), `route-manifest.test.ts` updated for multi-method routes.
  Browser click-test against a real `AccountBar` + `McpConnector` in `<scratchpad>/harness`.
- Location: `mcp/src/connections.ts`, `mcp/src/authHandler.ts`, `src/server/mcp/grant.ts`,
  `src/app/api/mcp/connections/route.ts`, `src/platform/route-manifest.ts`, `src/platform/admission.ts`,
  `src/components/SiteHeader.tsx`, `src/components/account-bar/AccountBar.tsx`, `src/vendor/mcp-connector/*`

[Task-253]
