import { expect, test, type Page } from '@playwright/test';
import { cell, noHorizontalOverflow, readHint, startGame, waitForYourTurn } from './helpers';

async function placeByTap(page: Page, moves: { x: number; y: number; letter: string }[], useTouch = false) {
  for (const m of moves) {
    let tile = page.locator(`[data-rack] [data-tile-letter="${m.letter}"]`).first();
    const isBlank = (await tile.count()) === 0;
    if (isBlank) tile = page.locator('[data-rack] [data-tile-letter=""]').first();
    if (useTouch) await tile.tap();
    else await tile.click();
    if (useTouch) await cell(page, m.x, m.y).tap();
    else await cell(page, m.x, m.y).click();
    if (isBlank) await page.locator(`[role=dialog] [data-letter="${m.letter}"]`).click();
  }
}

test.describe('single player gameplay', () => {
  test('tap-to-place builds an RTL word, previews the score and the bot replies', async ({ page }, info) => {
    await startGame(page, { seed: 7 });
    await noHorizontalOverflow(page);
    const hint = await readHint(page);
    expect(hint.length).toBeGreaterThanOrEqual(2);
    await page.getByRole('button', { name: 'Tutup cadangan' }).click();
    await placeByTap(page, hint, info.project.use.hasTouch === true);
    // Preview shows the logical Jawi string (never reversed) and a positive score.
    const word = (await page.getByTestId('preview-word').innerText()).trim();
    const horizontal = hint.every((h) => h.y === hint[0]!.y);
    const ordered = [...hint].sort((a, b) => (horizontal ? b.x - a.x : a.y - b.y)).map((h) => h.letter).join('');
    expect(word).toBe(ordered);
    const preview = Number((await page.getByTestId('preview-score').innerText()).replace(/\D/g, ''));
    expect(preview).toBeGreaterThan(0);
    await page.getByTestId('action-sahkan').click();
    await expect(page.getByTestId('hud-you')).toContainText(String(preview));
    for (const h of hint) await expect(cell(page, h.x, h.y)).toContainText(h.letter);
    // Bot thinks, plays, and it's our turn again.
    await waitForYourTurn(page);
    await expect(page.getByTestId('bag-count')).not.toHaveText('74');
  });

  test('mouse drag & drop places tiles and dragging back to the rack recalls them', async ({ page }, info) => {
    test.skip(info.project.use.hasTouch === true, 'mouse drag covered on desktop project');
    await startGame(page, { seed: 7 });
    const hint = await readHint(page);
    await page.getByRole('button', { name: 'Tutup cadangan' }).click();
    for (const m of hint) {
      const tile = page.locator(`[data-rack] [data-tile-letter="${m.letter}"]`).first();
      const from = (await tile.boundingBox())!;
      const to = (await cell(page, m.x, m.y).boundingBox())!;
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2 + 10, from.y - 10, { steps: 3 });
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
      await page.mouse.up();
      await expect(cell(page, m.x, m.y)).toContainText(m.letter);
    }
    await expect(page.getByTestId('preview-score')).toBeVisible();
    // Drag the first placed tile back onto the rack.
    const first = hint[0]!;
    const src = (await cell(page, first.x, first.y).boundingBox())!;
    const rack = (await page.getByTestId('rack').boundingBox())!;
    await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
    await page.mouse.down();
    await page.mouse.move(rack.x + rack.width - 10, rack.y + rack.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(cell(page, first.x, first.y)).not.toContainText(first.letter);
    await expect(page.getByTestId('rack').locator('[data-rack-index]')).toHaveCount(7 - hint.length + 1);
  });

  test('illegal first move is blocked with a Malay explanation', async ({ page }) => {
    await startGame(page, { seed: 7 });
    await page.locator('[data-rack] [data-rack-index="0"]').click();
    await cell(page, 1, 1).click();
    await expect(page.getByTestId('preview-error')).toContainText('petak tengah');
    await page.getByTestId('action-sahkan').click();
    await expect(page.getByRole('status').filter({ hasText: 'petak tengah' }).first()).toBeVisible();
    await expect(page.getByTestId('hud-you')).toContainText('GILIRAN');
    // SUSUN SEMULA recalls the tile.
    await page.getByTestId('action-susun').click();
    await expect(page.getByTestId('rack').locator('[data-rack-index]')).toHaveCount(7);
    // With nothing on the board, the same button shuffles the rack (same tiles).
    const ids = async () => page.getByTestId('rack').locator('[data-tile-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-tile-id')));
    const before = await ids();
    await expect(page.getByTestId('action-susun')).toContainText('kocok rak');
    await page.getByTestId('action-susun').click();
    const after = await ids();
    expect([...after].sort()).toEqual([...before].sort());
  });

  test('joker opens the letter picker and shows the chosen letter', async ({ page }) => {
    await startGame(page, { seed: 6 });
    await page.locator('[data-rack] [data-tile-letter=""]').first().click();
    await cell(page, 6, 6).click();
    await expect(page.getByRole('dialog', { name: 'Pilih huruf untuk joker' })).toBeVisible();
    await page.locator('[role=dialog] [data-letter="ب"]').click();
    await expect(cell(page, 6, 6)).toContainText('ب');
    await expect(cell(page, 6, 6)).toHaveAttribute('aria-label', /jubin anda ba/);
  });

  test('game state survives a page refresh and can be resumed', async ({ page }) => {
    await startGame(page, { seed: 7 });
    await page.getByTestId('action-bantuan').click();
    await page.getByTestId('apply-hint').click();
    await page.getByTestId('action-sahkan').click();
    await waitForYourTurn(page);
    await page.waitForTimeout(900); // let the score count-up animation settle
    const scores = (await page.getByTestId('hud').textContent())!;
    const tilesOnBoard = await page.locator('[data-cell][aria-label*=": "]').count();
    await page.reload();
    await expect(page.getByTestId('game-screen')).toBeVisible();
    await expect(page.getByTestId('hud')).toHaveText(scores);
    expect(await page.locator('[data-cell][aria-label*=": "]').count()).toBe(tilesOnBoard);
    await page.goto('/#/main');
    await expect(page.getByTestId('resume-game')).toBeVisible();
    await page.getByTestId('resume-game').click();
    await expect(page.getByTestId('game-screen')).toBeVisible();
  });

  test('swap consumes the turn; resign ends the game with confirmation', async ({ page }) => {
    await startGame(page, { seed: 7 });
    await page.getByTestId('action-tukar').click();
    await page.getByTestId('swap-tile').nth(0).click();
    await page.getByTestId('swap-tile').nth(1).click();
    await page.getByTestId('confirm-swap').click();
    await expect(page.getByTestId('hud-opponent')).toContainText('GILIRAN');
    await waitForYourTurn(page);
    await page.getByTestId('action-menu').click();
    await page.getByRole('button', { name: 'Menyerah kalah' }).click();
    await page.getByRole('button', { name: 'Ya, menyerah' }).click();
    await expect(page.getByTestId('results')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('result-title')).toContainText('menang kali ini');
    await page.goto('/#/sejarah');
    await expect(page.getByTestId('history')).toContainText('Kalah');
  });

  test('pause hides the board and resume restores it', async ({ page }) => {
    await startGame(page, { seed: 7 });
    await page.getByTestId('action-menu').click();
    await page.getByRole('button', { name: 'Jeda permainan' }).click();
    await expect(page.getByTestId('paused-overlay')).toBeVisible();
    await expect(page.getByTestId('action-sahkan')).toBeDisabled();
    await page.getByTestId('paused-overlay').getByRole('button', { name: 'Sambung' }).click();
    await expect(page.getByTestId('paused-overlay')).toBeHidden();
  });

  test('a full game against the MUDAH bot reaches the result ceremony', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-1280', 'long game runs once');
    test.setTimeout(240_000);
    await startGame(page, { seed: 21, level: 'mudah' });
    for (let turn = 0; turn < 80; turn++) {
      if (await page.getByTestId('results').isVisible()) break;
      const ready = await page
        .getByTestId('action-tukar')
        .isEnabled()
        .catch(() => false);
      if (!ready) {
        await page.waitForTimeout(400);
        continue;
      }
      await page.getByTestId('action-bantuan').click();
      const gotHint = await page
        .getByTestId('hint-panel')
        .waitFor({ timeout: 2_000 })
        .then(() => true)
        .catch(() => false);
      if (gotHint) {
        await page.getByTestId('apply-hint').click();
        await page.getByTestId('action-sahkan').click();
      } else {
        // No legal move: pass (swap may be blocked when the bag is low).
        await page.getByTestId('action-menu').click();
        await page.getByRole('button', { name: 'Langkau giliran' }).click();
        await page.getByRole('button', { name: 'Langkau', exact: true }).click();
      }
      await page.waitForTimeout(300);
    }
    await expect(page.getByTestId('results')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('result-title')).not.toBeEmpty();
  });
});
