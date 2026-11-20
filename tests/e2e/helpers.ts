import { expect, type Page } from '@playwright/test';

/** Start a fresh single-player game with a deterministic bag seed. */
export async function startGame(page: Page, opts: { seed?: number; level?: 'mudah' | 'sederhana' | 'sukar' } = {}) {
  await page.goto(`/?seed=${opts.seed ?? 7}#/single`);
  await page.evaluate(() => localStorage.removeItem('easy-jawi:single:v1'));
  await page.reload();
  await page.getByTestId(`level-${opts.level ?? 'mudah'}`).click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('game-screen')).toBeVisible();
  await expect(page.getByTestId('rack').locator('[data-rack-index]')).toHaveCount(7);
}

export const cell = (page: Page, x: number, y: number) => page.locator(`[data-cell][data-x="${x}"][data-y="${y}"]`);

/** Ask for a hint and return the suggested cells+letters (without applying). */
export async function readHint(page: Page): Promise<{ x: number; y: number; letter: string }[]> {
  await page.getByTestId('action-bantuan').click();
  await expect(page.getByTestId('hint-panel')).toBeVisible();
  const cells = page.locator('[data-cell][aria-label*="cadangan huruf"]');
  const n = await cells.count();
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = cells.nth(i);
    out.push({ x: Number(await c.getAttribute('data-x')), y: Number(await c.getAttribute('data-y')), letter: (await c.innerText()).trim() });
  }
  return out;
}

export async function waitForYourTurn(page: Page) {
  await expect(page.getByTestId('action-tukar')).toBeEnabled({ timeout: 15_000 });
}

export async function noHorizontalOverflow(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
}
