### Task 251: An admin scan can actually run
- [x] Found live: every scan under the admin policy answered 409 provider_request_conflict in production. Task 245 opened the admin ledger, but `ProviderRequestAuthority` still refused any begin that was not `owner-v1` (`validBeginInput`) and would have thrown on reading one back (`assertRequestRow`)
- [x] Both accept any known spend policy; an unknown version is still refused, and a request cannot switch policy
- [x] Worker integration test: an admin-policy request begins and reads back after eviction. 127/127, and the suite fails with the fix reverted
- Location: `src/platform/cloudflare/provider-request-authority.ts`, `test/worker/provider-request-authority.integration.test.ts`, `mcp/scripts/verify-oauth-live.mjs`
