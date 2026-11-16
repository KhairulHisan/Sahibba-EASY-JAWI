import { expect, test } from '@playwright/test';
import { noHorizontalOverflow, startGame } from './helpers';

test.describe('navigation, responsiveness and accessibility', () => {
  test('splash → home → every screen is reachable without horizontal overflow', async ({ page }) => {
    await page.goto('/#/');
    await page.getByTestId('splash').click();
    await expect(page.getByTestId('home')).toBeVisible();
    await noHorizontalOverflow(page);
    const screens: [string, string][] = [
      ['Cara Bermain', 'tutorial'],
      ['Kamus Jawi', 'dictionary'],
      ['Sejarah', 'history'],
      ['Tetapan', 'settings'],
    ];
    for (const [label, id] of screens) {
      await page.getByRole('button', { name: label }).click();
      await expect(page.getByTestId(id)).toBeVisible();
      await noHorizontalOverflow(page);
      await page.getByRole('button', { name: 'Kembali', exact: true }).click();
      await expect(page.getByTestId('home')).toBeVisible();
    }
    await page.getByTestId('mode-multi').click();
    await expect(page.getByTestId('multiplayer')).toContainText('Belum disambungkan');
    // Room buttons are honestly disabled — no fake connectivity.
    await expect(page.getByRole('button', { name: 'CIPTA BILIK' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'SERTAI BILIK' })).toBeDisabled();
    await noHorizontalOverflow(page);
  });

  test('game controls are ≥ 44 px and the board fits the viewport', async ({ page }) => {
    await startGame(page);
    await noHorizontalOverflow(page);
    for (const id of ['susun', 'tukar', 'bantuan', 'sahkan', 'menu']) {
      const box = (await page.getByTestId(`action-${id}`).boundingBox())!;
      expect(box.height, id).toBeGreaterThanOrEqual(44);
      expect(box.width, id).toBeGreaterThanOrEqual(44);
    }
    const tiles = page.getByTestId('rack').locator('[data-rack-index]');
    for (let i = 0; i < 7; i++) expect((await tiles.nth(i).boundingBox())!.width).toBeGreaterThanOrEqual(44);
    const vp = page.viewportSize()!;
    const board = (await page.getByTestId('board').boundingBox())!;
    expect(board.x).toBeGreaterThanOrEqual(0);
    expect(board.x + board.width).toBeLessThanOrEqual(vp.width + 1);
    expect(board.y + board.height).toBeLessThanOrEqual(vp.height + 1);
    // Zoom in/out keeps controls usable.
    await page.getByRole('button', { name: 'Zum masuk papan' }).click();
    await expect(page.getByRole('button', { name: 'Zum keluar papan' })).toBeEnabled();
    await noHorizontalOverflow(page);
  });

  test('board is keyboard operable with semantic labels', async ({ page }, info) => {
    test.skip(info.project.use.hasTouch === true, 'keyboard test on desktop');
    await startGame(page);
    await expect(page.getByRole('grid')).toHaveAttribute('aria-label', /Papan permainan 13 kali 13/);
    const centre = page.locator('[data-cell][data-x="6"][data-y="6"]');
    await expect(centre).toHaveAttribute('aria-label', /petak mula/);
    const firstTile = page.getByTestId('rack').locator('[data-rack-index="0"]');
    await firstTile.focus();
    await page.keyboard.press('Enter');
    await expect(firstTile).toHaveAttribute('aria-selected', 'true');
    await centre.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-cell][data-x="7"][data-y="6"]')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await expect(centre).toHaveAttribute('aria-label', /jubin anda/);
  });

  test('reduced motion and muted sound settings are respected', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#/tetapan');
    const sound = page.getByTestId('toggle-sound');
    await expect(sound).toHaveAttribute('aria-checked', 'true');
    await sound.click();
    await expect(sound).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('slider', { name: 'Kelantangan bunyi' })).toBeDisabled();
    await page.reload();
    await expect(page.getByTestId('toggle-sound')).toHaveAttribute('aria-checked', 'false');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  });

  test('Jawi webfont is loaded and covers every tile letter', async ({ page }) => {
    await page.goto('/#/kamus');
    await expect(page.getByTestId('dictionary')).toBeVisible();
    const ok = await page.evaluate(async () => {
      const letters = 'ابتةثجچحخدذرزسشصضطظعغڠفڤقکݢلمنوۏهءيڽ';
      await document.fonts.load('700 32px "Noto Naskh Arabic"', letters);
      await document.fonts.ready;
      return document.fonts.check('700 32px "Noto Naskh Arabic"', letters);
    });
    expect(ok).toBe(true);
  });
});
