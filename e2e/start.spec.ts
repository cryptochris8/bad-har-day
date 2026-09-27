// "Start the morning at" (Settings.startAct): the girls can skip Chris's early shift and begin at their part.
import { expect, test } from '@playwright/test';
import { expectNoErrors, frames, hooks, trackErrors } from './helpers';

test('a saved start at 6:30 shows on the menu and NEW MORNING begins at Hair time', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('bad-hair-day:save:v1', JSON.stringify({ version: 1, settings: { startAct: 3 } }));
  });
  await page.goto('/?test=1&quality=low');
  await hooks(page);
  await page.waitForFunction(() => window.__BHD__!.uiScreen() === 'title', null, { timeout: 90_000 });
  await frames(page, 10);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__BHD__!.uiScreen() === 'menu', null, { timeout: 30_000 });
  await expect(page.locator('.bhd-menu__new .bhd-btn__sub')).toHaveText(/6:30 · Hair time/);
  await page.waitForTimeout(700);
  await page.keyboard.press('Enter'); // NEW MORNING
  await page.waitForFunction(() => window.__BHD__!.act() === 3, null, { timeout: 90_000 });
  expect(await page.evaluate(() => window.__BHD__!.clock())).toBeGreaterThanOrEqual(6 * 60 + 30);
  expect(await page.evaluate(() => window.__BHD__!.act())).toBe(3);
  expectNoErrors(errors);
});
