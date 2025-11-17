### Task 155: Add Variable Speed Rainbow Animation to Waiting Status Text

**STATUS**: Not completed - reverted due to animation changes not applying correctly

- [ ] Implement variable speed rainbow animation
- [ ] Speed changes should be visible and actually take effect
- [ ] Apply speed changes consistently across entire text and "..." animation
- [ ] Ensure smooth transitions between speed changes

**Location**: `src/components/ProcessingSection.tsx`

**Technical Details**:
- Current animation uses fixed 4s duration for rainbow effect (line 80, 53, 59, 65)
- Need to dynamically adjust animation-duration using state/effect
- Both `RainbowText` component and `AnimatedEllipsis` component need synchronized speed changes

**Current Implementation**:
- `RainbowText` (lines 72-90): Each character has `animate-[rainbow_4s_linear_infinite]`
- `AnimatedEllipsis` (lines 45-70): Each dot has `rainbow 4s linear` animation
- Both use the `rainbow` keyframe animation defined in global CSS

---

## Previous Attempts - Lessons Learned

**Commits attempted** (reverted back to 689f0e8):
1. [a6dec93](https://github.com/mannanj/event-every/commit/a6dec93) - Initial implementation with random speed variations
2. [d7f4d51](https://github.com/mannanj/event-every/commit/d7f4d51) - Simplified to 2-speed alternating system
3. [ce4b381](https://github.com/mannanj/event-every/commit/ce4b381) - Doubled speed to 0.5s/1s
4. [af61ad7](https://github.com/mannanj/event-every/commit/af61ad7) - Tripled fast speed to 0.17s
5. [1be8dd4](https://github.com/mannanj/event-every/commit/1be8dd4) - 10x faster - 0.06s fast, 0.18s moderate
6. [65f5438](https://github.com/mannanj/event-every/commit/65f5438) - Added key prop to force animation restart

**What we tried**:
- Added state for `rainbowDuration` that changes on interval
- Passed dynamic duration to both `RainbowText` and `AnimatedEllipsis` components
- Updated inline styles to use dynamic `animation: rainbow ${rainbowDuration}s linear infinite`
- Added `key` prop with `rainbowDuration` to force React to remount elements and restart animations
- Simplified from random speeds to just 2 alternating speeds (fast/moderate)

**Issues encountered**:
- Animation speed changes were not visually applying despite code changes
- Changing CSS animation duration via inline styles doesn't trigger animation restart
- Even with key prop forcing remount, the visible animation speed didn't appear to change
- Possible issue: CSS animation may need different approach (CSS variables, animation-name changes, etc.)

**Next steps to try**:
- Investigate if CSS custom properties (variables) work better for dynamic animation duration
- Consider changing animation-name instead of duration to force restart
- Test in browser dev tools to verify animation-duration is actually updating in computed styles
- May need to use `@keyframes` with different names or CSS variable approach
