// The production build boots to the menus without errors, on desktop and phone.
import { expect, test } from '@playwright/test';
import { appScreen, expectNoErrors, frames, hooks, trackErrors } from './helpers';

test('boots to the menus with no errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?test=1&quality=low&noboot=1');
  await hooks(page);
  await frames(page, 20);
  expect(await appScreen(page)).toBe('menus');
  await expect(page.locator('#app canvas')).toBeVisible();
  await expect(page.locator('#bhd-loading')).toHaveCount(0, { timeout: 10_000 });
  expectNoErrors(errors);
});
