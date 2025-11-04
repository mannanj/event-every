### Task 30: Server-Side Authentication & Email Request Modal
- [x] Implement server-side rate limiting with IP-based attempt tracking
- [x] Add encrypted session management for attempt persistence
- [x] Remove "refresh the page" error messaging
- [x] Create EmailRequestModal component with reason input field
- [x] Display hello@mannan.is after user submits valid reason
- [x] Update AuthWrapper to show modal trigger when attempts exhausted
- [x] Add proper lockout mechanism (15-minute timeout)
- [x] Store failed attempt logs for security monitoring
- [x] Update API endpoint to return attemptsLeft from server
- [x] Ensure client cannot bypass attempt limits via localStorage manipulation
- Location: `src/app/api/auth/verify/route.ts`, `src/components/AuthWrapper.tsx`, `src/components/EmailRequestModal.tsx`, `src/hooks/useAuth.ts`

#### Implementation Details

**Server-Side Rate Limiting** (`src/app/api/auth/verify/route.ts`):
- Track attempts per IP address with in-memory Map
- Lock out after 3 failed attempts for 15 minutes
- Return remaining attempts count in API response
- Reset attempts on successful authentication
- Return 429 status when locked out

**Email Request Modal** (`src/components/EmailRequestModal.tsx`):
- Trigger when attempts exhausted
- Input field for "reason for requesting email"
- Submit button to reveal email: hello@mannan.is
- Close button to dismiss modal
- Black & white minimal design matching app aesthetic

**AuthWrapper Updates**:
- Replace "refresh page" error with email modal trigger
- Show "Request Access" button when locked out
- Remove localStorage-based attempt tracking
- Rely entirely on server-returned attempt counts

**Security Enhancements**:
- No client-side attempt manipulation possible
- Server enforces all rate limits
- IP-based tracking prevents refresh bypass
- Lockout persists for full timeout period
