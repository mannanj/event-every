import { test, expect } from '@playwright/test';

// Pattern-unlock behavior: drawing a valid pattern on the PatternLock canvas must
// transition from the lock screen to the unlocked app (input-box visible).
//
// useAuth.verifyPattern POSTs /api/auth/verify and unlocks on { success: true }
// (src/hooks/useAuth.ts:50). /api/auth/check drives the initial auth state
// (returns { authenticated } — false until verify succeeds, true after). We model
// that with an `authed` flag that the verify mock flips on.

test.describe('pattern unlock', () => {
  test('drawing a valid pattern unlocks the app', async ({ page }) => {
    let authed = false;
    await page.route('**/api/auth/verify', (route) => {
      authed = true;
      return route.fulfill({ json: { success: true } });
    });
    await page.route('**/api/auth/check', (route) =>
      route.fulfill({ json: { authenticated: authed } })
    );

    // /?unlock forces AuthWrapper into screen='pattern' (AuthWrapper.tsx:26).
    await page.goto('/?unlock');
    await expect(page.locator('canvas')).toBeVisible();

    // Attempt A: drive the canvas with bounding-box-relative pointer coords.
    // Canvas is 300×300; node centers are at canvas-local px {75,150,225}
    // (getDotPosition: spacing = 300/4 = 75). Draw the simplest valid 2-node line:
    // index 0 (75,75) → index 1 (150,75). handleEnd submits when length >= 2.
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.move(box.x + 75, box.y + 75);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 75, { steps: 10 });
    await page.mouse.up();

    // On a mocked-ok verify, isAuthenticated flips → AuthWrapper renders children
    // → the idle input container (input-box) appears.
    await expect(page.getByTestId('input-box')).toBeVisible({ timeout: 10000 });
  });
});
