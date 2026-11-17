/**
 * Smart Online Jawi Dictionary (Single Player) end-to-end, against the
 * Emulator Suite: real Firestore rules, the real validateJawiWordOnline
 * function, and the EMULATOR-ONLY fake provider (functions/src/emulatorFakeProvider.ts).
 *
 * Seed 7 gives the player the opening rack  ا ا ي م ڤ س ڠ.  Test words (two
 * letters, not in the local dictionary, placed through the ★ centre, read
 * right → left):  يا = provider VALID · يم = provider INVALID · اس = NOT_FOUND.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const PROJECT = 'demo-easy-jawi';
const contexts: BrowserContext[] = [];

test.beforeAll(async () => {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
});
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

async function device(browser: Browser): Promise<{ page: Page; ctx: BrowserContext }> {
  const ctx = await browser.newContext();
  contexts.push(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
  return { page, ctx };
}

const cell = (page: Page, x: number, y: number) => page.locator(`[data-cell][data-x="${x}"][data-y="${y}"]`);

async function startSeeded(page: Page, smart: boolean) {
  await page.goto('/?seed=7#tetapan');
  const toggle = page.getByTestId('toggle-smart-dictionary');
  if ((await toggle.getAttribute('aria-checked')) !== String(smart)) await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', String(smart));
  await page.goto('/?seed=7#single');
  await page.getByTestId('level-mudah').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('rack').locator('[data-rack-index]')).toHaveCount(7);
}

/** Two-letter word through the centre: first letter at x=7, second at x=6 (RTL). */
async function placeWord(page: Page, word: string) {
  const [a, b] = Array.from(word);
  for (const [letter, x] of [[a!, 7], [b!, 6]] as const) {
    await page.locator(`[data-rack] [data-tile-letter="${letter}"]`).first().click();
    await cell(page, x, 6).click();
  }
}

const draftCount = (page: Page) => page.locator('[data-cell][aria-label*="belum disahkan"]').count();
/** From the saved single-player game: the player's PLAY moves and score. */
const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('easy-jawi:single:v1') ?? '{}').state?.game as { moves: { playerId: string; type: string }[]; players: { id: string; score: number }[] });
const humanPlays = async (page: Page) => (await saved(page)).moves.filter((m) => m.playerId === 'anda' && m.type === 'play').length;
const savedScore = async (page: Page) => (await saved(page)).players.find((p) => p.id === 'anda')!.score;
const myScore = async (page: Page) => Number((await page.getByTestId('hud-you').innerText()).replace(/\D/g, '') || '0');

test('VALID from the licensed-provider adapter: checked online, scored once, evidence kept', async ({ browser }) => {
  const { page } = await device(browser);
  await startSeeded(page, true);
  await placeWord(page, 'يا');
  await expect(page.getByTestId('preview-online-hint')).toBeVisible();
  await page.getByTestId('action-sahkan').dblclick(); // a double tap must not play twice
  await expect(page.getByTestId('online-verified-badge')).toBeVisible();
  await expect.poll(() => humanPlays(page)).toBe(1);
  await expect(page.locator('[data-cell][data-placed]')).toHaveCount(2);
  await expect(page.getByTestId('rack').locator('[data-rack-index]')).toHaveCount(7);
  // Evidence stored on the device: source, version, method, provider reference.
  const cache = await page.evaluate(() => localStorage.getItem('easy-jawi:kamus-online:v1') ?? '');
  expect(cache).toContain('"method":"provider"');
  expect(cache).toContain('ujian:يا');
  expect(cache).toContain('"version":"ujian-1"');
  const game = await page.evaluate(() => localStorage.getItem('easy-jawi:single:v1') ?? '');
  expect(game).toContain('"onlineLog":[{"moveIndex":0');
  await page.waitForTimeout(800);
  expect(await humanPlays(page)).toBe(1);
  await expect.poll(() => myScore(page)).toBe(await savedScore(page)); // HUD settles on the engine's score
  expect(await savedScore(page)).toBeGreaterThan(0);
});

test('INVALID: rejected with the source named; no score, tiles stay, turn kept', async ({ browser }) => {
  const { page } = await device(browser);
  await startSeeded(page, true);
  await placeWord(page, 'يم');
  await page.getByTestId('action-sahkan').click();
  const row = page.getByTestId('online-row');
  await expect(row).toHaveAttribute('data-status', 'INVALID');
  await expect(row).toContainText('Penyedia ujian');
  await expect(page.getByTestId('suggest-word')).toHaveCount(0); // a rejected spelling is not offered for suggestion
  expect(await myScore(page)).toBe(0);
  expect(await draftCount(page)).toBe(2);
  await expect(page.getByTestId('action-tukar')).toBeEnabled(); // still your turn
  await page.getByTestId('online-close').click();
  expect(await draftCount(page)).toBe(2);
});

test('NOT_FOUND → Cadangkan → admin approves with evidence → retry → VALID from the central dictionary', async ({ browser }) => {
  const { page } = await device(browser);
  await startSeeded(page, true);
  await placeWord(page, 'اس');
  await page.getByTestId('action-sahkan').click();
  const row = page.getByTestId('online-row');
  await expect(row).toHaveAttribute('data-status', 'NOT_FOUND');
  await expect(row).toContainText('tidak bermaksud ejaan salah');
  await page.getByTestId('suggest-word').click();
  await expect(page.getByTestId('suggest-word')).toHaveText('Dicadangkan ✓');
  await expect(row).toHaveAttribute('data-status', 'PENDING_REVIEW');
  expect(await myScore(page)).toBe(0);
  expect(await draftCount(page)).toBe(2);

  // Admin (separate device): Google account on the Auth emulator (emulator builds sign in without a popup).
  const { page: admin } = await device(browser);
  await admin.goto('/#pentadbir');
  await admin.getByTestId('admin-sign-in').click();
  // A Google account that is not on the admin list sees its UID, but no data.
  await expect(admin.getByTestId('admin-not-allowed')).toBeVisible();
  await expect(admin.getByTestId('admin-suggestion')).toHaveCount(0);
  const uid = (await admin.getByTestId('admin-uid').innerText()).trim();
  // The project owner adds admins/{uid} in the console (bypasses rules) — emulated here.
  const res = await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/admins?documentId=${uid}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { role: { stringValue: 'admin' } } }),
  });
  expect(res.ok).toBe(true);
  await admin.getByRole('button', { name: 'Semak semula' }).click();
  const sug = admin.getByTestId('admin-suggestion');
  await expect(sug).toContainText('1 pemain');
  await admin.getByTestId('admin-approve').click();
  await expect(admin.getByTestId('admin-save')).toBeDisabled(); // source, version and evidence are required
  await admin.getByTestId('admin-source').fill('Kamus Dewan Edisi Keempat');
  await admin.getByTestId('admin-version').fill('Edisi 4');
  await admin.getByTestId('admin-note').fill('hlm. 80 (data ujian)');
  await admin.getByTestId('admin-save').click();
  await expect(admin.getByTestId('admin-suggestion')).toHaveCount(0);
  await admin.getByTestId('admin-tab-kamus').click();
  await expect(admin.getByTestId('admin-entry')).toContainText('Kamus Dewan Edisi Keempat (Edisi 4)');

  // Player retries: now verified by the central dictionary and scored.
  await page.getByTestId('online-retry').click();
  await expect(page.getByTestId('online-verified-badge')).toBeVisible();
  await expect.poll(() => myScore(page)).toBeGreaterThan(0);
  const cache = await page.evaluate(() => localStorage.getItem('easy-jawi:kamus-online:v1') ?? '');
  expect(cache).toContain('"method":"central-dictionary"');
  expect(cache).toContain('hlm. 80 (data ujian)');
});

test('Internet drops during SAHKAN: SERVICE_UNAVAILABLE, tiles and turn kept; retry after reconnect succeeds', async ({ browser }) => {
  const { page, ctx } = await device(browser);
  await startSeeded(page, true);
  await placeWord(page, 'يا');
  await ctx.setOffline(true);
  await page.getByTestId('action-sahkan').click();
  const row = page.getByTestId('online-row');
  await expect(row).toHaveAttribute('data-status', 'SERVICE_UNAVAILABLE');
  expect(await myScore(page)).toBe(0);
  expect(await draftCount(page)).toBe(2);
  await expect(page.getByTestId('action-tukar')).toBeEnabled();
  await ctx.setOffline(false);
  await page.getByTestId('online-retry').click();
  await expect(page.getByTestId('online-verified-badge')).toBeVisible();
  await expect.poll(() => myScore(page)).toBeGreaterThan(0);
});

test('Smart Online Dictionary OFF: unknown words are rejected locally, nothing is sent', async ({ browser }) => {
  const { page } = await device(browser);
  const calls: string[] = [];
  page.on('request', (r) => {
    if (/validateJawiWordOnline|dictionary%2F|\/dictionary\//.test(r.url())) calls.push(r.url());
  });
  await startSeeded(page, false);
  await placeWord(page, 'يا');
  await expect(page.getByTestId('word-preview')).toContainText('Ejaan belum ditemui dalam kamus');
  await page.getByTestId('action-sahkan').click();
  await expect(page.getByTestId('online-checking')).toHaveCount(0);
  await expect(page.getByTestId('online-result')).toHaveCount(0);
  expect(await myScore(page)).toBe(0);
  expect(await draftCount(page)).toBe(2);
  expect(calls).toEqual([]);
});
