### Task 252: An admin who has scanned today is not locked out of scanning
- [x] Found live: once an admin ledger had been spent from, it reported `admin-v1`, and `/api/usage` accepted only `owner-v1`, answering 503. The page reads 503 as "budget unavailable" and disables scanning, so an admin's first scan of the day would have switched their own scanning off
- [x] `/api/usage` accepts the caller's own policy (or the default an unspent ledger reports), and still refuses a ledger stamped with the other tier's
- [x] Test: a signed-out caller is never answered from an admin-stamped ledger
- Location: `src/app/api/usage/route.ts`, `src/app/api/usage/__tests__/route.test.ts`
