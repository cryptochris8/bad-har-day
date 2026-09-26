// A returning player's save survives a normal boot: FAMILY SETUP shows the SAVED family (regression: the boot path
// used to hand the UI no data, so the screen showed defaults and the first edit overwrote the save).
import { expect, test } from '@playwright/test';
import { expectNoErrors, frames, hooks, trackErrors } from './helpers';

test('saved family shows in FAMILY SETUP after a normal boot', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(
      'bad-hair-day:save:v1',
      JSON.stringify({ version: 1, family: { looks: { dog: { name: 'Rex', coat: 'black' } }, coffee: 'latte' } }),
    );
  });
  await page.goto('/?test=1&quality=low'); // normal boot (splash → title)
  await hooks(page);
  await page.waitForFunction(() => window.__BHD__!.uiScreen() === 'title', null, { timeout: 90_000 });
  await frames(page, 10);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__BHD__!.uiScreen() === 'menu', null, { timeout: 30_000 });
  await page.waitForTimeout(700);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter'); // FAMILY SETUP
  await page.waitForFunction(() => window.__BHD__!.uiScreen() === 'family', null, { timeout: 30_000 });
  // Tab through the members until the dog's name field shows.
  for (let i = 0; i < 8 && (await page.locator('.bhd-ui input.bhd-input').count()) === 0; i++) {
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(250);
  }
  await expect(page.locator('.bhd-ui input.bhd-input').first()).toHaveValue('Rex');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bad-hair-day:save:v1') ?? '{}'));
  expect(saved.family.looks.dog.name).toBe('Rex');
  expect(saved.family.coffee).toBe('latte');
  expectNoErrors(errors);
});
