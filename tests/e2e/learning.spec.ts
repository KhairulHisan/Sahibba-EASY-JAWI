import { expect, test } from '@playwright/test';
import { cell } from './helpers';

test.describe('tutorial, dictionary and teacher mode', () => {
  test('interactive tutorial plays a real right-to-left move and a vertical move', async ({ page }) => {
    await page.goto('/#/tutorial');
    await page.getByTestId('tutorial-next').click();
    // Step 1: بوکو right → left through the centre.
    for (const [x, y, ch] of [[7, 6, 'ب'], [6, 6, 'و'], [5, 6, 'ک'], [4, 6, 'و']] as const) {
      await page.locator(`[data-rack] [data-tile-letter="${ch}"]`).first().click();
      await cell(page, x, y).click();
    }
    const preview = page.getByTestId('tutorial-preview');
    await expect(preview.locator('[lang="ms-Arab"]')).toHaveText('بوکو');
    await expect(preview).toContainText('+28');
    await page.getByTestId('tutorial-confirm').click();
    await expect(page.getByTestId('word-detail')).toContainText('buku');
    await page.getByRole('button', { name: 'Tutup' }).click();
    // Step 2: باتو top → bottom using the existing ب.
    for (const [x, y, ch] of [[7, 7, 'ا'], [7, 8, 'ت'], [7, 9, 'و']] as const) {
      await page.locator(`[data-rack] [data-tile-letter="${ch}"]`).first().click();
      await cell(page, x, y).click();
    }
    await expect(preview.locator('[lang="ms-Arab"]')).toHaveText('باتو');
    await page.getByTestId('tutorial-confirm').click();
    await page.getByRole('button', { name: 'Tutup' }).click();
    await expect(page.getByTestId('tutorial-finish')).toBeVisible();
  });

  test('tutorial explains a wrong letter instead of accepting it', async ({ page }) => {
    await page.goto('/#/tutorial');
    await page.getByTestId('tutorial-next').click();
    await page.locator('[data-rack] [data-tile-letter="س"]').click();
    await cell(page, 7, 6).click();
    await expect(page.getByTestId('tutorial')).toContainText('memerlukan huruf ب');
  });

  test('dictionary search, filter and word detail', async ({ page }) => {
    await page.goto('/#/kamus');
    await expect(page.getByTestId('dictionary')).toContainText('BELUM DISEMAK GURU');
    await page.getByTestId('dict-search').fill('kucing');
    await page.getByRole('button', { name: /کوچيڠ kucing/ }).click();
    await expect(page.getByTestId('word-detail')).toContainText('Haiwan peliharaan');
    await page.getByRole('button', { name: 'Tutup' }).click();
    await page.getByTestId('dict-search').fill('');
    await page.getByRole('button', { name: 'Warna', exact: true }).click();
    await expect(page.getByText('hasil')).toContainText('11 hasil');
  });

  test('teacher import validates rows, saves a pack and the word becomes searchable', async ({ page }) => {
    await page.goto('/#/guru');
    await page.evaluate(() => localStorage.removeItem('easy-jawi:packs:v1'));
    await page.reload();
    await page.getByLabel('Nama pek').fill('D2 Haiwan');
    await page
      .getByTestId('teacher-input')
      .fill(['jawi,rumi,meaningMs,category,difficulty', 'کنچيل,kancil,Haiwan kecil yang cerdik,haiwan,1', 'پاسير,pasir,Butiran halus,alam,1'].join('\n'));
    await page.getByTestId('teacher-check').click();
    const report = page.getByTestId('teacher-report');
    await expect(report).toContainText('1/2 diterima');
    await expect(report).toContainText('mungkin ڤ');
    await page.getByTestId('teacher-save').click();
    await expect(page.getByTestId('teacher')).toContainText('D2 Haiwan');
    await page.goto('/#/kamus');
    await page.getByTestId('dict-search').fill('kancil');
    await expect(page.getByRole('button', { name: /کنچيل kancil/ })).toBeVisible();
  });
});
