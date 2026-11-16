import { describe, expect, it } from 'vitest';
import { coreLexicon } from '../../src/data';
import { suggestMove } from '../../src/engine/bot';
import { Rng } from '../../src/engine/rng';
import type { GameState } from '../../src/engine/types';
import type { HandDoc, RoomDoc, RoomSettings } from '../../src/multiplayer/protocol';
import { MP_TIMING } from '../../src/multiplayer/protocol';
import { MemoryRepo, type RandomSource } from '../../functions/src/repo';
import {
  PATHS,
  RoomError,
  act,
  approveJoin,
  claimTimeout,
  createRoom,
  expireRooms,
  purgeOldRooms,
  heartbeat,
  joinRoom,
  leaveRoom,
  setReady,
  startGame,
  updateSettings,
} from '../../functions/src/rooms';

const T0 = 1_800_000_000_000;
const SETTINGS: RoomSettings = { difficulty: 'mudah', turnSeconds: null, maxPlayers: 4, requireApproval: false };

function world(seed = 1) {
  const repo = new MemoryRepo();
  const rng = new Rng(seed);
  let ids = 0;
  const random: RandomSource = { int: (max) => rng.int(max), id: () => `room${String(++ids).padStart(4, '0')}` };
  let now = T0;
  const as = (uid: string) => ({ repo, uid, now, random });
  return {
    repo,
    as,
    advance: (ms: number) => (now += ms),
    get now() {
      return now;
    },
    room: (id: string) => repo.docs.get(PATHS.room(id)) as RoomDoc,
    state: (id: string) => (repo.docs.get(PATHS.server(id)) as { state: GameState }).state,
    hand: (id: string, uid: string) => repo.docs.get(PATHS.hand(id, uid)) as HandDoc | undefined,
  };
}

async function rejects(p: Promise<unknown>, reason: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, `expected ${reason}`).toBeInstanceOf(RoomError);
  expect((err as RoomError).reason).toBe(reason);
  return err as RoomError;
}

async function lobby(w: ReturnType<typeof world>, n: number, settings: Partial<RoomSettings> = {}) {
  const { roomId } = await createRoom(w.as('host'), { code: '0427', nickname: 'Hos', settings: { ...SETTINGS, ...settings } });
  for (let i = 1; i < n; i++) await joinRoom(w.as(`p${i}`), { code: '0427', nickname: `Pemain ${i}` });
  return roomId;
}

async function started(w: ReturnType<typeof world>, n: number, settings: Partial<RoomSettings> = {}) {
  const roomId = await lobby(w, n, settings);
  for (const uid of ['host', ...Array.from({ length: n - 1 }, (_, i) => `p${i + 1}`)]) await setReady(w.as(uid), { roomId, ready: true });
  await startGame(w.as('host'), { roomId });
  return roomId;
}

let actionSeq = 0;
const aid = () => `action-${String(++actionSeq).padStart(6, '0')}`;

describe('room codes', () => {
  it('keeps the leading zero and stores the code as a string', async () => {
    const w = world();
    const roomId = await lobby(w, 1);
    expect(w.room(roomId).code).toBe('0427');
    expect(w.repo.docs.get('roomCodes/0427')).toMatchObject({ roomId });
    expect(roomId).not.toContain('0427'); // the real id is independent of the invite code
  });

  it('rejects anything that is not exactly four digits', async () => {
    const w = world();
    for (const code of [427, '427', '04270', 'abcd', ' 0427', '04 7']) {
      await rejects(createRoom(w.as('h'), { code, nickname: 'H', settings: SETTINGS }), 'TIDAK_SAH');
    }
  });

  it('refuses an active code but frees it once the room expires', async () => {
    const w = world();
    await lobby(w, 1);
    await rejects(createRoom(w.as('other'), { code: '0427', nickname: 'Lain', settings: SETTINGS }), 'KOD_DIGUNAKAN');
    w.advance(MP_TIMING.activeTtlMs + 1);
    await expect(createRoom(w.as('other'), { code: '0427', nickname: 'Lain', settings: SETTINGS })).resolves.toHaveProperty('roomId');
  });

  it('invalid or expired codes cannot be joined', async () => {
    const w = world();
    await rejects(joinRoom(w.as('x'), { code: '9999', nickname: 'X' }), 'KOD_TIDAK_SAH');
    await lobby(w, 1);
    w.advance(MP_TIMING.activeTtlMs + 1);
    await rejects(joinRoom(w.as('x'), { code: '0427', nickname: 'X' }), 'KOD_TIDAK_SAH');
  });
});

describe('lobby', () => {
  it('admits 2–4 players, blocks the 5th, de-duplicates nicknames', async () => {
    const w = world();
    const { roomId } = await createRoom(w.as('host'), { code: '0427', nickname: 'Ali', settings: SETTINGS });
    await joinRoom(w.as('a'), { code: '0427', nickname: 'Ali' });
    await joinRoom(w.as('b'), { code: '0427', nickname: 'Ali' });
    await joinRoom(w.as('c'), { code: '0427', nickname: 'Siti' });
    await rejects(joinRoom(w.as('d'), { code: '0427', nickname: 'Lima' }), 'BILIK_PENUH');
    const room = w.room(roomId);
    expect(room.players.map((p) => p.nickname)).toEqual(['Ali', 'Ali 2', 'Ali 3', 'Siti']);
    expect(room.readerUids.sort()).toEqual(['a', 'b', 'c', 'host']);
  });

  it('sanitises nicknames', async () => {
    const w = world();
    const { roomId } = await createRoom(w.as('host'), { code: '0427', nickname: '<b>Ali</b>!!', settings: SETTINGS });
    expect(w.room(roomId).players[0]!.nickname).toBe('bAlib');
    await joinRoom(w.as('x'), { code: '0427', nickname: 'bodoh' });
    expect(w.room(roomId).players[1]!.nickname).toBe('Pemain');
  });

  it('host approval: pending until the host approves; only the host can approve', async () => {
    const w = world();
    const roomId = await lobby(w, 1, { requireApproval: true });
    expect(await joinRoom(w.as('a'), { code: '0427', nickname: 'Aminah' })).toEqual({ roomId, pending: true });
    expect(w.room(roomId).players).toHaveLength(1);
    expect(w.room(roomId).readerUids).toContain('a');
    await rejects(approveJoin(w.as('a'), { roomId, uid: 'a', approve: true }), 'BUKAN_HOS');
    await approveJoin(w.as('host'), { roomId, uid: 'a', approve: true });
    expect(w.room(roomId).players.map((p) => p.uid)).toEqual(['host', 'a']);
    await joinRoom(w.as('b'), { code: '0427', nickname: 'Badrul' });
    await approveJoin(w.as('host'), { roomId, uid: 'b', approve: false });
    expect(w.room(roomId).readerUids).not.toContain('b');
  });

  it('start needs 2–4 ready players and only the host can start', async () => {
    const w = world();
    const roomId = await lobby(w, 1);
    await setReady(w.as('host'), { roomId, ready: true });
    await rejects(startGame(w.as('host'), { roomId }), 'BELUM_SEDIA');
    await joinRoom(w.as('p1'), { code: '0427', nickname: 'P1' });
    expect(w.room(roomId).status).toBe('menunggu');
    await setReady(w.as('p1'), { roomId, ready: true });
    expect(w.room(roomId).status).toBe('sedia');
    await rejects(startGame(w.as('p1'), { roomId }), 'BUKAN_HOS');
    await startGame(w.as('host'), { roomId });
    expect(w.room(roomId).status).toBe('bermain');
  });

  it('changing settings un-readies everyone; settings are locked after start', async () => {
    const w = world();
    const roomId = await lobby(w, 2);
    await setReady(w.as('p1'), { roomId, ready: true });
    await updateSettings(w.as('host'), { roomId, settings: { ...SETTINGS, difficulty: 'sukar', turnSeconds: 60 } });
    expect(w.room(roomId).players.every((p) => !p.ready)).toBe(true);
    expect(w.room(roomId).settings).toMatchObject({ difficulty: 'sukar', turnSeconds: 60 });
    await rejects(updateSettings(w.as('p1'), { roomId, settings: SETTINGS }), 'BUKAN_HOS');
    for (const uid of ['host', 'p1']) await setReady(w.as(uid), { roomId, ready: true });
    await startGame(w.as('host'), { roomId });
    await rejects(updateSettings(w.as('host'), { roomId, settings: SETTINGS }), 'SUDAH_BERMULA');
    await rejects(joinRoom(w.as('late'), { code: '0427', nickname: 'Lewat' }), 'SUDAH_BERMULA');
    expect(await joinRoom(w.as('p1'), { code: '0427', nickname: 'P1' })).toEqual({ roomId, pending: false }); // reconnect
  });
});

describe('private racks', () => {
  it('public room data never contains racks or the bag; each hand is stored separately', async () => {
    const w = world();
    const roomId = await started(w, 3);
    const room = w.room(roomId);
    const publicJson = JSON.stringify(room);
    const state = w.state(roomId);
    for (const p of state.players) {
      expect(w.hand(roomId, p.id)!.rack).toEqual(p.rack);
      for (const t of p.rack) expect(publicJson).not.toContain(`"${t.id}"`);
    }
    for (const t of state.bag) expect(publicJson).not.toContain(`"${t.id}"`);
    expect(room.game!.bagCount).toBe(state.bag.length);
    expect(room.players.every((p) => p.rackCount === 7)).toBe(true);
  });

  it('server shuffle uses the injected entropy source (different deals per seed)', async () => {
    const a = world(1);
    const b = world(2);
    const ra = await started(a, 2);
    const rb = await started(b, 2);
    expect(a.state(ra).bag.map((t) => t.id)).not.toEqual(b.state(rb).bag.map((t) => t.id));
  });
});

describe('turns', () => {
  it('rejects out-of-turn moves, applies valid ones once, and is idempotent on retry', async () => {
    const w = world(5);
    const roomId = await started(w, 2);
    const state = w.state(roomId);
    const current = state.players[state.currentPlayer]!.id;
    const other = state.players.find((p) => p.id !== current)!.id;
    const move = suggestMove(state, state.currentPlayer, coreLexicon(), 'sukar')!;
    expect(move).not.toBeNull();

    const wrong = await rejects(act(w.as(other), { roomId, kind: 'pass', actionId: aid(), expectedVersion: 0 }), 'LANGKAH_DITOLAK');
    expect(wrong.detail?.engineCode).toBe('NOT_YOUR_TURN');
    await rejects(act(w.as('stranger'), { roomId, kind: 'pass', actionId: aid(), expectedVersion: 0 }), 'BUKAN_AHLI');

    const id = aid();
    const res = await act(w.as(current), { roomId, kind: 'play', actionId: id, expectedVersion: 0, placements: move.placements });
    expect(res).toMatchObject({ ok: true, version: 1, score: move.score });
    const room = w.room(roomId);
    expect(room.players.find((p) => p.uid === current)!.score).toBe(move.score);
    expect(room.game!.currentUid).toBe(other);
    expect(room.game!.lastMove).toMatchObject({ uid: current, type: 'play', score: move.score });
    expect(w.repo.docs.has(PATHS.move(roomId, 0))).toBe(true);
    expect(w.hand(roomId, current)!.version).toBe(1);

    // Network retry with the same action id → success without scoring twice.
    expect(await act(w.as(current), { roomId, kind: 'play', actionId: id, expectedVersion: 0, placements: move.placements })).toMatchObject({ duplicate: true });
    expect(w.room(roomId).players.find((p) => p.uid === current)!.score).toBe(move.score);

    const stale = await rejects(act(w.as(other), { roomId, kind: 'pass', actionId: aid(), expectedVersion: 0 }), 'LANGKAH_DITOLAK');
    expect(stale.detail?.engineCode).toBe('STALE_VERSION');
  });

  it('dictionary and geometry are validated on the server, with the reason returned', async () => {
    const w = world(5);
    const roomId = await started(w, 2);
    const state = w.state(roomId);
    const me = state.players[state.currentPlayer]!;
    const err = await rejects(
      act(w.as(me.id), { roomId, kind: 'play', actionId: aid(), expectedVersion: 0, placements: [{ tileId: me.rack[0]!.id, x: 0, y: 0 }] }),
      'LANGKAH_DITOLAK',
    );
    expect(err.detail?.engineCode).toBe('FIRST_MOVE_CENTER');
    const forged = await rejects(
      act(w.as(me.id), { roomId, kind: 'play', actionId: aid(), expectedVersion: 0, placements: [{ tileId: 'not-mine', x: 6, y: 6 }, { tileId: 'nope', x: 5, y: 6 }] }),
      'LANGKAH_DITOLAK',
    );
    expect(forged.detail?.engineCode).toBe('TILE_NOT_OWNED');
    await rejects(act(w.as(me.id), { roomId, kind: 'play', actionId: aid(), expectedVersion: 0, placements: [{ tileId: 'x', x: 99, y: 0 }] }), 'TIDAK_SAH');
  });

  it('turn timer: others may claim a timeout only after the deadline, exactly once', async () => {
    const w = world(3);
    const roomId = await started(w, 3, { turnSeconds: 60 });
    const room = w.room(roomId);
    const current = room.game!.currentUid;
    const claimer = room.players.find((p) => p.uid !== current)!.uid;
    expect(room.game!.turnDeadline).toBe(w.now + 60_000);
    await rejects(claimTimeout(w.as(claimer), { roomId, expectedVersion: 0 }), 'BELUM_TAMAT_MASA');
    w.advance(60_000 + MP_TIMING.deadlineGraceMs);
    expect(await claimTimeout(w.as(claimer), { roomId, expectedVersion: 0 })).toMatchObject({ ok: true, version: 1 });
    expect(await claimTimeout(w.as(current), { roomId, expectedVersion: 0 })).toMatchObject({ stale: true });
    const after = w.room(roomId);
    expect(after.game!.lastMove).toMatchObject({ uid: current, type: 'timeout' });
    expect(after.game!.currentUid).not.toBe(current);
    expect(after.game!.turnDeadline).toBe(w.now + 60_000);
  });

  it('a disconnected player is skipped after the grace period even without a timer', async () => {
    const w = world(3);
    const roomId = await started(w, 2);
    const current = w.room(roomId).game!.currentUid;
    const other = w.room(roomId).players.find((p) => p.uid !== current)!.uid;
    w.advance(MP_TIMING.turnDisconnectGraceMs - 1000);
    await heartbeat(w.as(other), { roomId });
    await rejects(claimTimeout(w.as(other), { roomId, expectedVersion: 0 }), 'BELUM_TAMAT_MASA');
    w.advance(2000);
    await expect(claimTimeout(w.as(other), { roomId, expectedVersion: 0 })).resolves.toMatchObject({ version: 1 });
  });
});

describe('presence and leaving', () => {
  it('hands the host role to a connected player when the host disappears', async () => {
    const w = world();
    const roomId = await lobby(w, 3);
    w.advance(MP_TIMING.hostGraceMs + 1);
    await heartbeat(w.as('p2'), { roomId });
    expect(w.room(roomId).hostUid).toBe('p2'); // the first connected player takes over
    await heartbeat(w.as('p1'), { roomId });
    expect(w.room(roomId).hostUid).toBe('p2'); // stable once a live host exists
  });

  it('leaving before the start frees the seat and passes the host role', async () => {
    const w = world();
    const roomId = await lobby(w, 3);
    await leaveRoom(w.as('host'), { roomId });
    const room = w.room(roomId);
    expect(room.players.map((p) => p.uid)).toEqual(['p1', 'p2']);
    expect(room.hostUid).toBe('p1');
    expect(room.readerUids).not.toContain('host');
  });

  it('leaving mid-game resigns; with two players the other wins and the code is freed', async () => {
    const w = world(9);
    const roomId = await started(w, 2);
    await leaveRoom(w.as('p1'), { roomId });
    const room = w.room(roomId);
    expect(room.status).toBe('tamat');
    expect(room.game!.result).toMatchObject({ reason: 'resign', winners: ['host'] });
    expect(w.repo.docs.has('roomCodes/0427')).toBe(false);
    await expect(createRoom(w.as('new'), { code: '0427', nickname: 'Baru', settings: SETTINGS })).resolves.toBeTruthy();
  });

  it('leaving a 3-player game keeps the game going for the others', async () => {
    const w = world(9);
    const roomId = await started(w, 3);
    await leaveRoom(w.as('p2'), { roomId });
    const room = w.room(roomId);
    expect(room.status).toBe('bermain');
    expect(room.players.find((p) => p.uid === 'p2')).toMatchObject({ left: true, resigned: true });
    await rejects(act(w.as('p2'), { roomId, kind: 'pass', actionId: aid(), expectedVersion: room.game!.version }), 'BUKAN_AHLI');
  });
});

describe('abuse limits and expiry', () => {
  it('throttles join attempts, counting failed guesses too', async () => {
    const w = world();
    for (let i = 0; i < 12; i++) await rejects(joinRoom(w.as('guesser'), { code: String(1000 + i), nickname: 'G' }), 'KOD_TIDAK_SAH');
    await rejects(joinRoom(w.as('guesser'), { code: '0427', nickname: 'G' }), 'TERLALU_BANYAK_CUBAAN');
    w.advance(10 * 60_000 + 1);
    await rejects(joinRoom(w.as('guesser'), { code: '1234', nickname: 'G' }), 'KOD_TIDAK_SAH');
  });

  it('the scheduled sweep marks stale rooms as expired and frees their codes', async () => {
    const w = world();
    const roomId = await lobby(w, 2);
    w.advance(MP_TIMING.activeTtlMs + 1);
    expect(await expireRooms(w.repo, w.now)).toBe(1);
    expect(w.room(roomId).status).toBe('tamat-tempoh');
    expect(w.repo.docs.has('roomCodes/0427')).toBe(false);
  });

  it('deletes closed rooms (nicknames, racks, move log, server state) a day after they expire — never active ones', async () => {
    const w = world();
    const old = await started(w, 2);
    w.advance(MP_TIMING.activeTtlMs + 1);
    await expireRooms(w.repo, w.now);
    const active = (await createRoom(w.as('other'), { code: '1111', nickname: 'Baru', settings: SETTINGS })).roomId;
    expect([...w.repo.docs.keys()].some((k) => k.startsWith(`rooms/${old}/hands/`))).toBe(true);

    expect(await purgeOldRooms(w.repo, w.now)).toBe(0); // too recent
    w.advance(MP_TIMING.purgeAfterMs + 1);
    expect(await purgeOldRooms(w.repo, w.now)).toBe(1);
    const left = [...w.repo.docs.keys()];
    expect(left.filter((k) => k.includes(old))).toEqual([]);
    expect(w.room(active).status).toBe('menunggu'); // purge never touches rooms that are not closed
  });
});

describe('a full 3-player game through the server', () => {
  it('plays to the end with only server-validated moves', async () => {
    const w = world(21);
    const roomId = await started(w, 3);
    let guard = 0;
    while (w.room(roomId).status === 'bermain' && guard++ < 400) {
      const state = w.state(roomId);
      const idx = state.currentPlayer;
      const uid = state.players[idx]!.id;
      const move = suggestMove(state, idx, coreLexicon(), 'sederhana');
      const base = { roomId, actionId: aid(), expectedVersion: state.version };
      if (move) await act(w.as(uid), { ...base, kind: 'play', placements: move.placements });
      else await act(w.as(uid), { ...base, kind: 'pass' });
    }
    const room = w.room(roomId);
    expect(room.status).toBe('tamat');
    expect(room.game!.result!.winners.length).toBeGreaterThan(0);
    const state = w.state(roomId);
    for (const p of room.players) expect(p.score).toBe(state.players.find((s) => s.id === p.uid)!.score);
    expect(w.repo.docs.has('roomCodes/0427')).toBe(false);
  });
});
