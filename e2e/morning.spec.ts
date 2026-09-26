// A whole morning plays through (autopilot) from 5:15 AM to the Morning Report Card.
import { expect, test } from '@playwright/test';
import { expectNoErrors, hooks, trackErrors, waitAppScreen } from './helpers';

test('autopilot morning reaches the report card', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?test=1&quality=low&autostart=1&seed=2026');
  await hooks(page);
  await page.waitForFunction(() => window.__BHD__!.act() === 1, null, { timeout: 90_000 });
  await page.evaluate(() => window.__BHD__!.autopilot(true));
  await waitAppScreen(page, 'results');
  const report = (await page.evaluate(() => window.__BHD__!.report())) as { records: { id: string; stars: number }[]; arrival: number; awards: unknown[] };
  const ids = report.records.map((r) => r.id);
  for (const id of ['dog', 'coffee', 'wake', 'hair', 'rush', 'drive']) expect(ids).toContain(id);
  expect(report.arrival).toBeLessThanOrEqual(8 * 60 + 5);
  expect(report.awards.length).toBeGreaterThanOrEqual(2);
  expectNoErrors(errors);
});
