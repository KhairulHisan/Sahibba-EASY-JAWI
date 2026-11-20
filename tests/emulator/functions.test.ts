/**
 * End-to-end against the Firebase Emulator Suite with the real client SDK:
 * anonymous auth → callable functions → Firestore reads under security rules.
 * Each "player" is an independent Firebase app with its own auth user.
 */
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TILE_DISTRIBUTION, coreLexicon } from '../../src/data';
import { suggestMove } from '../../src/engine/bot';
import { createGame } from '../../src/engine/game';
import type { HandDoc, RoomDoc, RoomSettings } from '../../src/multiplayer/protocol';

const PROJECT = 'demo-easy-jawi';
interface Client {
  app: FirebaseApp;
  uid: string;
  db: Firestore;
  call: <T = unknown>(name: string, data: unknown) => Promise<T>;
}
const apps: FirebaseApp[] = [];
let seq = 0;

async function client(): Promise<Client> {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key', appId: 'demo-app' }, `player-${++seq}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const fns = getFunctions(app, 'asia-southeast1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const { user } = await signInAnonymously(auth);
  return { app, uid: user.uid, db, call: async (name, data) => (await httpsCallable(fns, name)(data)).data as never };
}

async function failure(p: Promise<unknown>): Promise<{ code: string; reason?: string; engineCode?: string }> {
  try {
    await p;
  } catch (e) {
    const err = e as { code: string; details?: { reason?: string; engineCode?: string } };
    return { code: err.code, reason: err.details?.reason, engineCode: err.details?.engineCode };
  }
  throw new Error('expected the call to fail');
}

const room = async (c: Client, id: string) => (await getDoc(doc(c.db, 'rooms', id))).data() as RoomDoc;
const hand = async (c: Client, id: string) => (await getDoc(doc(c.db, 'rooms', id, 'hands', c.uid))).data() as HandDoc;

/** What a client can know: the public board + its own rack. Enough for a hint. */
function localView(r: RoomDoc, h: HandDoc, uid: string) {
  const g = createGame({
    id: 'local',
    players: r.players.map((p) => ({ id: p.uid, name: p.nickname, kind: 'human' as const })),
    difficulty: r.settings.difficulty,
    distribution: TILE_DISTRIBUTION,
    seed: 1,
  });
  g.board = r.game!.board;
  g.version = r.game!.version;
  g.players.forEach((p) => (p.rack = p.id === uid ? h.rack : []));
  g.currentPlayer = g.players.findIndex((p) => p.id === r.game!.currentUid);
  return g;
}

const SETTINGS: RoomSettings = { difficulty: 'sederhana', turnSeconds: 90, maxPlayers: 4, requireApproval: false };

beforeAll(async () => {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
});

afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
});

describe('multiplayer over the emulator suite', () => {
  it('create 0427 → 4 players join → 5th blocked → start → private racks → server-validated, idempotent moves', async () => {
    const [host, b, c, d, e, outsider] = await Promise.all([client(), client(), client(), client(), client(), client()]);

    const { roomId } = await host.call<{ roomId: string }>('createRoom', { code: '0427', nickname: 'Cikgu Aminah', settings: SETTINGS });
    expect((await room(host, roomId)).code).toBe('0427');
    expect((await failure(b.call('createRoom', { code: '0427', nickname: 'X', settings: SETTINGS }))).reason).toBe('KOD_DIGUNAKAN');

    for (const [p, name] of [[b, 'Ali'], [c, 'Ali'], [d, 'Siti']] as const) {
      expect(await p.call('joinRoom', { code: '0427', nickname: name })).toEqual({ roomId, pending: false });
    }
    const fifth = await failure(e.call('joinRoom', { code: '0427', nickname: 'Lima' }));
    expect(fifth).toMatchObject({ code: 'functions/failed-precondition', reason: 'BILIK_PENUH' });
    expect((await failure(e.call('joinRoom', { code: '9999', nickname: 'Lima' }))).reason).toBe('KOD_TIDAK_SAH');

    let r = await room(host, roomId);
    expect(r.players.map((p) => p.nickname)).toEqual(['Cikgu Aminah', 'Ali', 'Ali 2', 'Siti']);
    expect(r.settings).toMatchObject({ difficulty: 'sederhana', turnSeconds: 90 });

    // Not ready yet → cannot start; non-host cannot start.
    expect((await failure(host.call('startGame', { roomId }))).reason).toBe('BELUM_SEDIA');
    for (const p of [host, b, c, d]) await p.call('setReady', { roomId, ready: true });
    expect((await room(b, roomId)).status).toBe('sedia');
    expect((await failure(b.call('startGame', { roomId }))).reason).toBe('BUKAN_HOS');
    await host.call('startGame', { roomId });
    r = await room(host, roomId);
    expect(r.status).toBe('bermain');
    expect(r.game!.bagCount).toBe(88 - 4 * 7);

    // Privacy: own rack readable, others' racks and the server state are not.
    for (const p of [host, b, c, d]) expect((await hand(p, roomId)).rack).toHaveLength(7);
    expect((await failure(getDoc(doc(b.db, 'rooms', roomId, 'hands', host.uid)))).code).toBe('permission-denied');
    expect((await failure(getDoc(doc(b.db, 'serverState', roomId)))).code).toBe('permission-denied');
    expect((await failure(getDoc(doc(outsider.db, 'rooms', roomId)))).code).toBe('permission-denied');
    const publicJson = JSON.stringify(r);
    for (const t of (await hand(host, roomId)).rack) expect(publicJson).not.toContain(`"${t.id}"`);

    // Late joiner is refused; the current player moves; others cannot.
    expect((await failure(e.call('joinRoom', { code: '0427', nickname: 'Lewat' }))).reason).toBe('SUDAH_BERMULA');
    const players = { [host.uid]: host, [b.uid]: b, [c.uid]: c, [d.uid]: d };
    const current = players[r.game!.currentUid]!;
    const notCurrent = [host, b, c, d].find((p) => p !== current)!;
    const wrongTurn = await failure(notCurrent.call('gameAction', { roomId, kind: 'pass', actionId: 'pass-out-of-turn-01', expectedVersion: 0 }));
    expect(wrongTurn).toMatchObject({ reason: 'LANGKAH_DITOLAK', engineCode: 'NOT_YOUR_TURN' });

    const view = localView(r, await hand(current, roomId), current.uid);
    const move = suggestMove(view, view.currentPlayer, coreLexicon(), 'sukar');
    expect(move).not.toBeNull();
    const request = { roomId, kind: 'play', actionId: 'first-move-0001', expectedVersion: 0, placements: move!.placements };
    const first = await current.call<{ version: number; score: number }>('gameAction', request);
    expect(first).toMatchObject({ ok: true, version: 1, score: move!.score });
    // Network retry of the same action → reported as duplicate, never scored twice.
    expect(await current.call('gameAction', request)).toMatchObject({ duplicate: true });
    r = await room(notCurrent, roomId);
    expect(r.players.find((p) => p.uid === current.uid)!.score).toBe(move!.score);
    expect(r.game!.version).toBe(1);
    expect(r.game!.lastMove).toMatchObject({ type: 'play', uid: current.uid });
    expect(r.game!.currentUid).not.toBe(current.uid);
    expect((await hand(current, roomId)).rack).toHaveLength(7); // refilled from the bag

    // Leaving mid-game = resign; the other three continue.
    await d.call('leaveRoom', { roomId });
    r = await room(host, roomId);
    expect(r.status).toBe('bermain');
    expect(r.players.find((p) => p.uid === d.uid)).toMatchObject({ left: true, resigned: true });
  });

  it('host approval keeps a joiner pending until approved', async () => {
    const [host, guest] = await Promise.all([client(), client()]);
    const { roomId } = await host.call<{ roomId: string }>('createRoom', { code: '0007', nickname: 'Hos', settings: { ...SETTINGS, requireApproval: true } });
    expect(await guest.call('joinRoom', { code: '0007', nickname: 'Tetamu' })).toEqual({ roomId, pending: true });
    expect((await room(guest, roomId)).pending.map((p) => p.uid)).toEqual([guest.uid]); // pending users can watch their status
    await host.call('approveJoin', { roomId, uid: guest.uid, approve: true });
    expect((await room(guest, roomId)).players.map((p) => p.uid)).toEqual([host.uid, guest.uid]);
  });
});

describe('validateJawiWordOnline over the emulator (emulator-only fake provider)', () => {
  it('returns VALID / INVALID / NOT_FOUND with source + evidence, normalises input, and rejects bad input', async () => {
    const p = await client();
    const res = await p.call<{ results: { key: string; status: string; source?: { id: string; version: string }; evidence?: { method: string; reference?: string } }[]; provider: { configured: boolean } }>(
      'validateJawiWordOnline',
      { words: ['يا', 'يم', 'اس', 'ظا'] },
    );
    expect(res.provider.configured).toBe(true);
    expect(res.results.map((r) => r.status)).toEqual(['SERVICE_UNAVAILABLE', 'SERVICE_UNAVAILABLE', 'SERVICE_UNAVAILABLE', 'SERVICE_UNAVAILABLE']); // one failing word fails the provider batch
    const ok = await p.call<typeof res>('validateJawiWordOnline', { words: ['يا', 'يم', 'اس'] });
    expect(ok.results.map((r) => r.status)).toEqual(['VALID', 'INVALID', 'NOT_FOUND']);
    expect(ok.results[0]).toMatchObject({ source: { id: 'ujian-emulator', version: 'ujian-1' }, evidence: { method: 'provider', reference: 'ujian:يا' } });
    expect((await failure(p.call('validateJawiWordOnline', { words: ['buku'] }))).reason).toBe('TIDAK_SAH');
    // The server cache is not readable by clients.
    expect((await failure(getDoc(doc(p.db, 'dictionaryCache', 'ujian-emulator__يا')))).code).toBe('permission-denied');
  });
});
