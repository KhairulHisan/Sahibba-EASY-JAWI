/**
 * Multiplayer end-to-end: every player is a separate browser context (its own
 * storage + anonymous Firebase user), talking to the real Cloud Functions,
 * Firestore and Auth running in the Emulator Suite.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const PROJECT = 'demo-easy-jawi';
const contexts: BrowserContext[] = [];

test.beforeAll(async () => {
  // Fresh database for each run (rooms, codes, rate limits).
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
});

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

async function device(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  contexts.push(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
  return page;
}

async function openMulti(page: Page) {
  await page.goto('/#multi');
  await expect(page.getByTestId('mp-submit')).toBeVisible();
}

async function createRoom(page: Page, code: string, nickname: string, opts: { timer?: string; maxPlayers?: string; approval?: boolean } = {}) {
  await openMulti(page);
  await page.getByTestId('room-code-input').fill(code);
  await page.getByTestId('mp-nickname').fill(nickname);
  if (opts.timer) await page.getByRole('radiogroup', { name: 'Pemasa giliran' }).getByRole('radio', { name: opts.timer }).click();
  if (opts.maxPlayers) await page.getByRole('radiogroup', { name: 'Pemain maksimum' }).getByRole('radio', { name: opts.maxPlayers }).click();
  if (opts.approval) await page.getByRole('switch').click();
  await page.getByTestId('mp-submit').click();
  await expect(page.getByTestId('lobby-code')).toHaveText(code);
}

async function joinRoom(page: Page, code: string, nickname: string) {
  await openMulti(page);
  await page.getByTestId('mp-tab-sertai').click();
  await page.getByTestId('room-code-input').fill(code);
  await page.getByTestId('mp-nickname').fill(nickname);
  await page.getByTestId('mp-submit').click();
}

/** Every player presses SEDIA, then the host starts. */
async function readyAndStart(host: Page, players: Page[]) {
  for (const p of players) await p.getByTestId('lobby-ready').click();
  for (const p of players) await expect(p.getByTestId('lobby-ready')).toHaveText(/BATAL SEDIA/);
  await expect(host.getByTestId('lobby-status')).toHaveText('Sedia untuk bermula');
  await host.getByTestId('lobby-start').click();
  for (const p of players) await expect(p.getByTestId('mp-table')).toBeVisible();
  for (const p of players) await expect(p.getByTestId('rack').locator('[data-rack-index]')).toHaveCount(7);
}

/** The player whose TUKAR button is enabled is the one whose turn it is. */
async function currentPlayer(players: Page[]): Promise<Page> {
  await expect
    .poll(async () => {
      for (const p of players) if (await p.getByTestId('action-tukar').isEnabled()) return true;
      return false;
    })
    .toBe(true);
  for (const p of players) if (await p.getByTestId('action-tukar').isEnabled()) return p;
  throw new Error('no current player');
}

const placedCount = (page: Page) => page.locator('[data-cell][data-placed]').count();

test('four devices: code 0427, 5th blocked, ready, start, synced server-validated turns, reload, leave', async ({ browser }) => {
  const [host, b, c, d, e] = await Promise.all([1, 2, 3, 4, 5].map(() => device(browser)));
  await createRoom(host, '0427', 'Cikgu');
  await expect(host.getByTestId('lobby-status')).toHaveText('Menunggu pemain');
  await expect(host.getByTestId('lobby-start')).toBeDisabled();

  for (const [p, name] of [[b, 'Ali'], [c, 'Ali'], [d, 'Siti']] as const) {
    await joinRoom(p, '0427', name);
    await expect(p.getByTestId('lobby-code')).toHaveText('0427');
  }
  await expect(host.getByTestId('lobby-player')).toHaveCount(4);
  await expect(host.getByTestId('lobby')).toContainText('Ali 2'); // duplicate nickname made unique

  // Fifth device is refused, with a clear message.
  await joinRoom(e, '0427', 'Lima');
  await expect(e.getByTestId('mp-error')).toContainText('penuh');
  // A wrong code is refused too.
  await e.getByTestId('room-code-input').fill('9999');
  await e.getByTestId('mp-submit').click();
  await expect(e.getByTestId('mp-error')).toContainText('tidak sah');

  // Only the host can start, and only when everyone is ready.
  await expect(b.getByTestId('lobby-start')).toHaveCount(0);
  await readyAndStart(host, [host, b, c, d]);
  const players = [host, b, c, d];

  // HUD shows all four players and the shared bag size (88 − 4×7).
  for (const p of players) {
    await expect(p.getByTestId('hud-opponent')).toHaveCount(3);
    await expect(p.getByTestId('bag-count')).toHaveText('60');
  }

  // Exactly one player may act.
  const first = await currentPlayer(players);
  for (const p of players) if (p !== first) await expect(p.getByTestId('action-sahkan')).toBeDisabled();

  // Play the hinted move (hints are unlimited at MUDAH) and confirm on the server.
  await first.getByTestId('action-bantuan').click();
  await expect(first.getByTestId('hint-panel')).toBeVisible();
  await first.getByTestId('apply-hint').click();
  await expect(first.getByTestId('action-sahkan')).toBeEnabled();
  await first.getByTestId('action-sahkan').click();

  // Every device sees the same board; the mover's rack is refilled to 7.
  await expect.poll(() => placedCount(first)).toBeGreaterThan(1);
  const tiles = await placedCount(first);
  for (const p of players) await expect.poll(() => placedCount(p)).toBe(tiles);
  await expect(first.getByTestId('rack').locator('[data-rack-index]')).toHaveCount(7);
  for (const p of players) await expect(p.getByTestId('bag-count')).toHaveText(String(60 - tiles));

  // The turn moved to someone else.
  const second = await currentPlayer(players);
  expect(second).not.toBe(first);

  // Reconnect: reload a device mid-game → same anonymous user, same rack, same board.
  const rackBefore = await b.getByTestId('rack').innerText();
  await b.reload();
  await expect(b.getByTestId('mp-table')).toBeVisible();
  await expect(b.getByTestId('rack').locator('[data-rack-index]')).toHaveCount(7);
  expect(await b.getByTestId('rack').innerText()).toBe(rackBefore);
  await expect.poll(() => placedCount(b)).toBe(tiles);

  // The second player passes; turn moves on and everyone is notified.
  await second.getByTestId('action-menu').click();
  await second.getByRole('button', { name: 'Langkau giliran' }).click();
  await second.getByRole('button', { name: 'Langkau', exact: true }).click();
  const third = await currentPlayer(players);
  expect(third).not.toBe(second);

  // A player leaves mid-game: counted as resign, the others continue.
  const leaver = players.find((p) => p !== third && p !== host)!;
  await leaver.getByTestId('action-menu').click();
  await leaver.getByRole('button', { name: 'Keluar bilik' }).click();
  await leaver.getByRole('button', { name: 'Keluar', exact: true }).click();
  await expect(leaver.getByTestId('multiplayer')).toBeVisible();
  await expect(host.getByTestId('mp-table')).toContainText('KELUAR');
  await expect(host.getByTestId('mp-results')).toHaveCount(0);
});

test('host approval: a joiner waits until approved; leading-zero code is kept and cannot be taken twice', async ({ browser }) => {
  const [host, guest, other] = await Promise.all([1, 2, 3].map(() => device(browser)));
  await createRoom(host, '0007', 'Hos', { approval: true, maxPlayers: '2 pemain' });

  await joinRoom(other, '0007', 'Dua');
  await expect(other.getByTestId('room-notice')).toContainText('Menunggu kelulusan hos');
  await host.getByRole('button', { name: 'Tolak' }).click();
  await expect(other.getByTestId('room-notice')).toContainText('bukan ahli', { ignoreCase: true });

  await joinRoom(guest, '0007', 'Tetamu');
  await expect(guest.getByTestId('room-notice')).toContainText('Menunggu kelulusan hos');
  await host.getByTestId('approve-join').click();
  await expect(guest.getByTestId('lobby-code')).toHaveText('0007');
  await expect(host.getByTestId('lobby-player')).toHaveCount(2);

  // The same code cannot be created again while the room is open.
  await openMulti(other);
  await other.getByTestId('room-code-input').fill('0007');
  await other.getByTestId('mp-submit').click();
  await expect(other.getByTestId('mp-error')).toContainText('sedang digunakan');

  // Settings are visible to everyone; changing them resets SEDIA.
  await guest.getByTestId('lobby-ready').click();
  await expect(guest.getByTestId('lobby-ready')).toHaveText(/BATAL SEDIA/);
  await host.getByRole('button', { name: 'Tukar tetapan' }).click();
  await host.getByRole('radiogroup', { name: 'Tahap bilik' }).getByRole('radio', { name: 'SUKAR' }).click();
  await host.getByRole('button', { name: 'Simpan' }).click();
  await expect(guest.getByTestId('lobby-settings')).toContainText('SUKAR');
  await expect(guest.getByTestId('lobby-ready')).toHaveText('SEDIA');
});

test('turn timer: when the deadline passes the server skips the turn', async ({ browser }) => {
  test.setTimeout(200_000);
  const [host, guest] = await Promise.all([1, 2].map(() => device(browser)));
  await createRoom(host, '0060', 'Hos', { timer: '60 saat', maxPlayers: '2 pemain' });
  await joinRoom(guest, '0060', 'Tetamu');
  await expect(guest.getByTestId('lobby-code')).toHaveText('0060');
  await readyAndStart(host, [host, guest]);

  const first = await currentPlayer([host, guest]);
  const other = first === host ? guest : host;
  await expect(first.getByRole('timer')).toBeVisible();
  // Nobody moves: after 60 s (+ grace) the turn is skipped for everyone.
  await expect(other.getByTestId('action-tukar')).toBeEnabled({ timeout: 90_000 });
  await expect(first.getByTestId('action-tukar')).toBeDisabled();
});

test('whole game to the end: resign leaves one winner and both devices show results', async ({ browser }) => {
  const [host, guest] = await Promise.all([1, 2].map(() => device(browser)));
  await createRoom(host, '1234', 'Hos', { maxPlayers: '2 pemain' });
  await joinRoom(guest, '1234', 'Tetamu');
  await expect(guest.getByTestId('lobby-code')).toHaveText('1234');
  await readyAndStart(host, [host, guest]);

  await guest.getByTestId('action-menu').click();
  await guest.getByRole('button', { name: /Menyerah kalah/ }).click();
  await guest.getByRole('button', { name: 'Ya, menyerah' }).click();
  for (const p of [host, guest]) await expect(p.getByTestId('mp-results')).toBeVisible();
  await expect(host.getByTestId('mp-results')).toContainText('anda menang');
  await expect(host.getByTestId('mp-result-row').first()).toContainText('Hos');

  // The code is released at once and the result is in local history.
  await host.getByTestId('mp-results-exit').click();
  await expect(host.getByTestId('multiplayer')).toBeVisible();
  await host.getByTestId('room-code-input').fill('1234');
  await host.getByTestId('mp-nickname').fill('Hos');
  await host.getByTestId('mp-submit').click();
  await expect(host.getByTestId('lobby-code')).toHaveText('1234');
  const history = await host.evaluate(() => localStorage.getItem('easy-jawi:history:v1') ?? '');
  expect(history).toContain('mp-');
});
