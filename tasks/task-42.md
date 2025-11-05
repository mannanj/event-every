### Task 42: Backend - Unlock Code System for Extended Event Limit
- [ ] Create unlock codes table/storage for 3 single-use codes
- [ ] Add unlock code validation endpoint
- [ ] Implement code redemption logic (marks code as used)
- [ ] Extend rate limit check to use 100 events when unlock code is active
- [ ] Add unlock code status to user session/storage
- [ ] Generate 3 pre-defined unlock codes

**Location:** `src/services/`, `src/app/api/`

**Details:**
- 3 single-use codes that expand limit from 10 to 100 events/day
- Code validation endpoint: POST /api/unlock
- Store redeemed codes in localStorage or session
- Rate limiter should check if user has active unlock code
- Codes should be simple, memorable strings
