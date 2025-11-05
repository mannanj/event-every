### Task 43: UI - Unlock Code Input in Daily Limit Display
- [ ] Add unlock code input field to daily limit box
- [ ] Implement code submission handler
- [ ] Show success/error feedback for code redemption
- [ ] Update limit display to show 100 when code is active
- [ ] Add visual indicator for unlocked status
- [ ] Persist unlock status across page refreshes

**Location:** `src/components/DailyLimitDisplay.tsx`

**Details:**
- Input field appears in the daily limit box (Image #1)
- Black & white minimal design
- Shows "9/100" when unlocked
- Clear success message on valid code
- Error message for invalid/used codes
- Store unlock status in localStorage
