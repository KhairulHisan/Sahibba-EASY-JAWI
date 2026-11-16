/**
 * Authoritative multiplayer room logic. Every exported handler runs inside a
 * repository transaction and is the ONLY way room/game data changes. Clients
 * never write Firestore directly (see firestore.rules).
 *
 * The game itself is the same pure engine as single player: applyAction()
 * enforces turn order, tile ownership, geometry, dictionary, scoring,
 * optimistic versioning (expectedVersion) and idempotency (action id).
 */
import { TILE_DISTRIBUTION, coreLexicon } from '../../src/data';
import { applyAction, createGame } from '../../src/engine/game';
import type { GameAction, GameState, Placement } from '../../src/engine/types';
import { sanitizeNickname } from '../../src/lib/nickname';
import {
  MP_TIMING,
  ROOM_CODE_RE,
  ROOM_ERROR_MESSAGE,
  TURN_SECONDS_OPTIONS,
  type ActResult,
  type GameActionRequest,
  type HandDoc,
  type PublicGame,
  type PublicPlayer,
  type RoomDoc,
  type RoomErrorReason,
  type RoomSettings,
} from '../../src/multiplayer/protocol';
import type { RandomSource, Repo, Tx } from './repo';

export type ErrorStatus = 'invalid-argument' | 'failed-precondition' | 'permission-denied' | 'not-found' | 'resource-exhausted' | 'already-exists';

export class RoomError extends Error {
  constructor(
    readonly reason: RoomErrorReason,
    readonly status: ErrorStatus,
    message?: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message ?? ROOM_ERROR_MESSAGE[reason]);
  }
}

export interface Ctx {
  repo: Repo;
  uid: string;
  now: number;
  random: RandomSource;
}

export const PATHS = {
  code: (code: string) => `roomCodes/${code}`,
  room: (id: string) => `rooms/${id}`,
  hand: (id: string, uid: string) => `rooms/${id}/hands/${uid}`,
  move: (id: string, n: number) => `rooms/${id}/moves/${String(n).padStart(4, '0')}`,
  server: (id: string) => `serverState/${id}`,
  limit: (uid: string) => `rateLimits/${uid}`,
};

interface CodeDoc {
  roomId: string;
  expiresAt: number;
}
interface ServerDoc {
  state: GameState | null;
}

const MAX_PENDING = 8;
const RATE = { create: { max: 6, windowMs: 10 * 60_000 }, join: { max: 12, windowMs: 10 * 60_000 } };

// ---------------------------------------------------------------------------
// Input validation (never trust the client)
// ---------------------------------------------------------------------------

const bad = (message: string) => new RoomError('TIDAK_SAH', 'invalid-argument', message);

function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw bad('Permintaan tidak sah.');
  return v as Record<string, unknown>;
}

export function parseCode(v: unknown): string {
  if (typeof v !== 'string' || !ROOM_CODE_RE.test(v)) throw bad('Kod bilik mesti tepat 4 digit, contohnya 0427.');
  return v;
}

function parseRoomId(v: unknown): string {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{6,40}$/.test(v)) throw bad('Bilik tidak sah.');
  return v;
}

function parseActionId(v: unknown): string {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(v)) throw bad('Id tindakan tidak sah.');
  return v;
}

function parseVersion(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw bad('Versi tidak sah.');
  return v;
}

function parseNickname(v: unknown): string {
  if (typeof v !== 'string') throw bad('Nama panggilan diperlukan.');
  return sanitizeNickname(v);
}

export function parseSettings(v: unknown): RoomSettings {
  const o = obj(v);
  const difficulty = o.difficulty;
  if (difficulty !== 'mudah' && difficulty !== 'sederhana' && difficulty !== 'sukar') throw bad('Tahap tidak sah.');
  const turnSeconds = o.turnSeconds ?? null;
  if (!(TURN_SECONDS_OPTIONS as readonly unknown[]).includes(turnSeconds)) throw bad('Pemasa tidak sah.');
  const maxPlayers = o.maxPlayers;
  if (maxPlayers !== 2 && maxPlayers !== 3 && maxPlayers !== 4) throw bad('Bilangan pemain mesti 2 hingga 4.');
  return { difficulty, turnSeconds: turnSeconds as RoomSettings['turnSeconds'], maxPlayers, requireApproval: o.requireApproval === true };
}

function parsePlacements(v: unknown): Placement[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > 7) throw bad('Letakkan 1 hingga 7 jubin.');
  return v.map((raw) => {
    const p = obj(raw);
    const okInt = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 13;
    if (typeof p.tileId !== 'string' || p.tileId.length > 24 || !okInt(p.x) || !okInt(p.y)) throw bad('Kedudukan jubin tidak sah.');
    if (p.letter !== undefined && (typeof p.letter !== 'string' || p.letter.length > 4)) throw bad('Huruf joker tidak sah.');
    return { tileId: p.tileId, x: p.x as number, y: p.y as number, ...(p.letter !== undefined ? { letter: p.letter as string } : {}) };
  });
}

function parseTileIds(v: unknown): string[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > 7 || !v.every((t) => typeof t === 'string' && t.length <= 24)) throw bad('Pilih 1 hingga 7 jubin.');
  return v as string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTIVE = new Set(['menunggu', 'sedia', 'bermain']);
const isActive = (room: RoomDoc, now: number) => ACTIVE.has(room.status) && room.expiresAt > now;

function readers(room: RoomDoc): string[] {
  return [...new Set([...room.players.map((p) => p.uid), ...room.pending.map((p) => p.uid)])];
}

function lobbyStatus(room: RoomDoc): RoomDoc['status'] {
  return room.players.length >= 2 && room.players.every((p) => p.ready) ? 'sedia' : 'menunggu';
}

function uniqueNickname(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name.slice(0, 13)} ${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

function requirePlayer(room: RoomDoc, uid: string): PublicPlayer {
  const me = room.players.find((p) => p.uid === uid && !p.left);
  if (!me) throw new RoomError('BUKAN_AHLI', 'permission-denied');
  return me;
}

function requireHost(room: RoomDoc, uid: string) {
  if (room.hostUid !== uid) throw new RoomError('BUKAN_HOS', 'permission-denied');
}

function requireLobby(room: RoomDoc, now: number) {
  if (!isActive(room, now)) throw new RoomError('BILIK_TAMAT', 'failed-precondition');
  if (room.status === 'bermain') throw new RoomError('SUDAH_BERMULA', 'failed-precondition');
}

async function loadRoom(tx: Tx, roomId: string): Promise<RoomDoc> {
  const room = await tx.get<RoomDoc>(PATHS.room(roomId));
  if (!room) throw new RoomError('KOD_TIDAK_SAH', 'not-found', 'Bilik tidak ditemui.');
  return room;
}

/** Counted in its own committed transaction, so failed attempts still count. */
async function consumeRate(ctx: Ctx, kind: keyof typeof RATE) {
  const { max, windowMs } = RATE[kind];
  const count = await ctx.repo.run(async (tx) => {
    const doc = (await tx.get<Record<string, { start: number; count: number }>>(PATHS.limit(ctx.uid))) ?? {};
    const w = doc[kind];
    const cur = !w || ctx.now - w.start > windowMs ? { start: ctx.now, count: 0 } : { ...w };
    cur.count += 1;
    tx.set(PATHS.limit(ctx.uid), { ...doc, [kind]: cur });
    return cur.count;
  });
  if (count > max) throw new RoomError('TERLALU_BANYAK_CUBAAN', 'resource-exhausted');
}

/** Re-shuffle every tile with the server CSPRNG and re-deal (seeded PRNG is not secret-safe). */
export function secureDeal(state: GameState, random: RandomSource): GameState {
  const all = [...state.bag, ...state.players.flatMap((p) => p.rack)];
  for (let i = all.length - 1; i > 0; i--) {
    const j = random.int(i + 1);
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  for (const p of state.players) p.rack = all.splice(all.length - state.rules.rackSize, state.rules.rackSize).reverse();
  state.bag = all;
  state.rngState = random.int(0x1_0000_0000) >>> 0;
  return state;
}

/** Public projection: no bag contents, no racks, no applied action ids. */
export function projectGame(state: GameState, settings: RoomSettings, now: number, prev: PublicGame | null): PublicGame {
  const current = state.players[state.currentPlayer]!;
  const sameTurn = prev && prev.currentUid === current.id && prev.turn === state.turn;
  const last = state.moves[state.moves.length - 1];
  return {
    version: state.version,
    board: state.board,
    bagCount: state.bag.length,
    currentUid: current.id,
    turn: state.turn,
    turnDeadline: state.phase !== 'active' || !settings.turnSeconds ? null : sameTurn ? prev.turnDeadline : now + settings.turnSeconds * 1000,
    consecutiveScoreless: state.consecutiveScoreless,
    rules: state.rules,
    lastMove: last
      ? {
          uid: last.playerId,
          type: last.type,
          score: last.score,
          words: last.words,
          placements: last.placements,
          ...(last.swapped !== undefined ? { swapped: last.swapped } : {}),
          ...(last.allTilesBonus !== undefined ? { allTilesBonus: last.allTilesBonus } : {}),
          at: last.at,
        }
      : null,
    moveCount: state.moves.length,
    result: state.result
      ? {
          reason: state.result.reason,
          winners: state.result.winners,
          isTie: state.result.isTie,
          finalScores: state.result.finalScores.map((f) => ({ uid: f.playerId, score: f.score, penalty: f.penalty, resigned: f.resigned })),
        }
      : null,
  };
}

/** Write a new authoritative state and everything derived from it. */
function commitState(tx: Tx, roomId: string, room: RoomDoc, prev: GameState, next: GameState, now: number, codeDoc: CodeDoc | null) {
  room.game = projectGame(next, room.settings, now, room.game);
  for (const p of room.players) {
    const sp = next.players.find((x) => x.id === p.uid);
    if (!sp) continue;
    p.score = sp.score;
    p.rackCount = sp.rack.length;
    p.resigned = sp.resigned;
  }
  const ownsCode = codeDoc?.roomId === roomId;
  if (next.phase === 'finished') {
    room.status = 'tamat';
    room.expiresAt = now + MP_TIMING.finishedTtlMs;
    if (ownsCode) tx.delete(PATHS.code(room.code)); // the code can be reused at once
  } else {
    room.expiresAt = now + MP_TIMING.activeTtlMs;
    if (ownsCode) tx.set(PATHS.code(room.code), { roomId, expiresAt: room.expiresAt });
  }
  room.updatedAt = now;
  tx.set<ServerDoc>(PATHS.server(roomId), { state: next });
  tx.set(PATHS.room(roomId), room);
  for (const p of next.players) {
    const before = prev.players.find((x) => x.id === p.id);
    if (!before || JSON.stringify(before.rack) !== JSON.stringify(p.rack)) {
      tx.set<HandDoc>(PATHS.hand(roomId, p.id), { rack: p.rack, version: next.version });
    }
  }
  for (let i = prev.moves.length; i < next.moves.length; i++) {
    const m = next.moves[i]!;
    tx.set(PATHS.move(roomId, i), { ...m, uid: m.playerId });
  }
}

function newPlayer(uid: string, nickname: string, seat: number, now: number): PublicPlayer {
  return { uid, nickname, seat, ready: false, joinedAt: now, lastSeen: now, score: 0, rackCount: 0, resigned: false, left: false };
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

export async function createRoom(ctx: Ctx, input: unknown): Promise<{ roomId: string }> {
  const o = obj(input);
  const code = parseCode(o.code);
  const nickname = parseNickname(o.nickname);
  const settings = parseSettings(o.settings);
  await consumeRate(ctx, 'create');
  const roomId = ctx.random.id();
  return ctx.repo.run(async (tx) => {
    const existing = await tx.get<CodeDoc>(PATHS.code(code));
    if (existing) {
      const other = await tx.get<RoomDoc>(PATHS.room(existing.roomId));
      if (other && isActive(other, ctx.now)) throw new RoomError('KOD_DIGUNAKAN', 'already-exists');
    }
    const room: RoomDoc = {
      code,
      status: 'menunggu',
      hostUid: ctx.uid,
      settings,
      players: [newPlayer(ctx.uid, nickname, 0, ctx.now)],
      pending: [],
      readerUids: [ctx.uid],
      game: null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      expiresAt: ctx.now + MP_TIMING.activeTtlMs,
    };
    tx.set<CodeDoc>(PATHS.code(code), { roomId, expiresAt: room.expiresAt });
    tx.set(PATHS.room(roomId), room);
    tx.set<ServerDoc>(PATHS.server(roomId), { state: null });
    return { roomId };
  });
}

export async function joinRoom(ctx: Ctx, input: unknown): Promise<{ roomId: string; pending: boolean }> {
  const o = obj(input);
  const code = parseCode(o.code);
  const nickname = parseNickname(o.nickname);
  await consumeRate(ctx, 'join');
  return ctx.repo.run(async (tx) => {
    const codeDoc = await tx.get<CodeDoc>(PATHS.code(code));
    if (!codeDoc) throw new RoomError('KOD_TIDAK_SAH', 'not-found');
    const room = await tx.get<RoomDoc>(PATHS.room(codeDoc.roomId));
    if (!room || !isActive(room, ctx.now)) throw new RoomError('KOD_TIDAK_SAH', 'not-found');
    const roomId = codeDoc.roomId;
    // Re-joining after a refresh or on a second tab is always allowed.
    if (room.players.some((p) => p.uid === ctx.uid)) return { roomId, pending: false };
    if (room.pending.some((p) => p.uid === ctx.uid)) return { roomId, pending: true };
    if (room.status === 'bermain') throw new RoomError('SUDAH_BERMULA', 'failed-precondition');
    if (room.players.length >= room.settings.maxPlayers) throw new RoomError('BILIK_PENUH', 'failed-precondition');
    const name = uniqueNickname(nickname, [...room.players, ...room.pending].map((p) => p.nickname));
    const pending = room.settings.requireApproval;
    if (pending) {
      if (room.pending.length >= MAX_PENDING) throw new RoomError('BILIK_PENUH', 'failed-precondition', 'Terlalu banyak permintaan menunggu kelulusan.');
      room.pending.push({ uid: ctx.uid, nickname: name, requestedAt: ctx.now });
    } else {
      room.players.push(newPlayer(ctx.uid, name, room.players.length, ctx.now));
    }
    room.readerUids = readers(room);
    room.status = lobbyStatus(room);
    room.updatedAt = ctx.now;
    room.expiresAt = ctx.now + MP_TIMING.activeTtlMs;
    tx.set(PATHS.code(code), { roomId, expiresAt: room.expiresAt });
    tx.set(PATHS.room(roomId), room);
    return { roomId, pending };
  });
}

export async function approveJoin(ctx: Ctx, input: unknown): Promise<{ ok: true }> {
  const o = obj(input);
  const roomId = parseRoomId(o.roomId);
  const target = typeof o.uid === 'string' ? o.uid : '';
  const approve = o.approve === true;
  return ctx.repo.run(async (tx) => {
    const room = await loadRoom(tx, roomId);
    requireHost(room, ctx.uid);
    requireLobby(room, ctx.now);
    const req = room.pending.find((p) => p.uid === target);
    if (!req) throw bad('Permintaan tidak ditemui.');
    room.pending = room.pending.filter((p) => p.uid !== target);
    if (approve) {
      if (room.players.length >= room.settings.maxPlayers) throw new RoomError('BILIK_PENUH', 'failed-precondition');
      room.players.push(newPlayer(req.uid, req.nickname, room.players.length, ctx.now));
    }
    room.readerUids = readers(room);
    room.status = lobbyStatus(room);
    room.updatedAt = ctx.now;
    tx.set(PATHS.room(roomId), room);
    return { ok: true as const };
  });
}

export async function setReady(ctx: Ctx, input: unknown): Promise<{ ok: true }> {
  const o = obj(input);
  const roomId = parseRoomId(o.roomId);
  return ctx.repo.run(async (tx) => {
    const room = await loadRoom(tx, roomId);
    requireLobby(room, ctx.now);
    const me = requirePlayer(room, ctx.uid);
    me.ready = o.ready === true;
    me.lastSeen = ctx.now;
    room.status = lobbyStatus(room);
    room.updatedAt = ctx.now;
    tx.set(PATHS.room(roomId), room);
    return { ok: true as const };
  });
}

export async function updateSettings(ctx: Ctx, input: unknown): Promise<{ ok: true }> {
  const o = obj(input);
  const roomId = parseRoomId(o.roomId);
  const settings = parseSettings(o.settings);
  return ctx.repo.run(async (tx) => {
    const room = await loadRoom(tx, roomId);
    requireHost(room, ctx.uid);
    requireLobby(room, ctx.now);
    if (room.players.length > settings.maxPlayers) throw bad('Bilangan pemain dalam bilik melebihi had baharu.');
    room.settings = settings;
    // Everyone must re-confirm the new rules before the game can start.
    for (const p of room.players) p.ready = false;
    room.status = lobbyStatus(room);
    room.updatedAt = ctx.now;
    tx.set(PATHS.room(roomId), room);
    return { ok: true as const };
  });
}

export async function startGame(ctx: Ctx, input: unknown): Promise<{ ok: true }> {
  const o = obj(input);
  const roomId = parseRoomId(o.roomId);
  return ctx.repo.run(async (tx) => {
    const room = await loadRoom(tx, roomId);
    requireHost(room, ctx.uid);
    requireLobby(room, ctx.now);
    if (room.players.length < 2 || room.players.length > 4 || !room.players.every((p) => p.ready)) {
      throw new RoomError('BELUM_SEDIA', 'failed-precondition');
    }
    // Random turn order, then a CSPRNG shuffle of the whole tile set.
    const order = [...room.players];
    for (let i = order.length - 1; i > 0; i--) {
      const j = ctx.random.int(i + 1);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const state = secureDeal(
      createGame({
        id: roomId,
        players: order.map((p) => ({ id: p.uid, name: p.nickname, kind: 'human' as const })),
        difficulty: room.settings.difficulty,
        distribution: TILE_DISTRIBUTION,
        seed: ctx.random.int(0x7fff_ffff),
        now: ctx.now,
      }),
      ctx.random,
    );
    room.players = order.map((p, seat) => ({ ...p, seat, score: 0, rackCount: state.rules.rackSize, resigned: false }));
    room.status = 'bermain';
    room.game = projectGame(state, room.settings, ctx.now, null);
    room.updatedAt = ctx.now;
    room.expiresAt = ctx.now + MP_TIMING.activeTtlMs;
    tx.set<ServerDoc>(PATHS.server(roomId), { state });
    tx.set(PATHS.room(roomId), room);
    for (const p of state.players) tx.set<HandDoc>(PATHS.hand(roomId, p.id), { rack: p.rack, version: state.version });
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// Game actions
// ---------------------------------------------------------------------------

export async function act(ctx: Ctx, input: unknown): Promise<ActResult> {
  const o = obj(input) as Partial<GameActionRequest> & Record<string, unknown>;
  const roomId = parseRoomId(o.roomId);
  const id = parseActionId(o.actionId);
  const expectedVersion = parseVersion(o.expectedVersion);
  let action: GameAction;
  const base = { id, playerId: ctx.uid, expectedVersion };
  switch (o.kind) {
    case 'play':
      action = { ...base, type: 'PLAY', placements: parsePlacements(o.placements) };
      break;
    case 'swap':
      action = { ...base, type: 'SWAP', tileIds: parseTileIds(o.tileIds) };
      break;
    case 'pass':
      action = { ...base, type: 'PASS' };
      break;
    case 'resign':
      action = { ...base, type: 'RESIGN' };
      break;
    default:
      throw bad('Jenis tindakan tidak sah.');
  }
  return ctx.repo.run(async (tx) => {
    const room = await loadRoom(tx, roomId);
    const server = await tx.get<ServerDoc>(PATHS.server(roomId));
    const codeDoc = await tx.get<CodeDoc>(PATHS.code(room.code));
    requirePlayer(room, ctx.uid);
    if (room.status !== 'bermain' || !server?.state) throw new RoomError(room.status === 'tamat' ? 'BILIK_TAMAT' : 'BELUM_SEDIA', 'failed-precondition');
    const prev = server.state;
    prev.rngState = ctx.random.int(0x1_0000_0000) >>> 0; // fresh entropy for any bag reshuffle
    const res = applyAction(prev, action, coreLexicon(), ctx.now);
    if (!res.ok) {
      // A retried request that already succeeded is a success, not an error.
      if (res.error.code === 'DUPLICATE_ACTION') return { ok: true, version: prev.version, duplicate: true };
      throw new RoomError('LANGKAH_DITOLAK', 'failed-precondition', res.error.message, {
        engineCode: res.error.code,
        ...(res.error.words ? { words: res.error.words } : {}),
        ...(res.error.cells ? { cells: res.error.cells } : {}),
      });
    }
    commitState(tx, roomId, room, prev, res.state, ctx.now, codeDoc);
    return { ok: true, version: res.state.version, score: res.event.kind === 'play' ? res.event.score : 0 };
  });
}

/**
 * Any member may ask the server to skip the current turn once its deadline
 * has passed, or once the current player has been disconnected for a while
 * (games without a timer). The action id is derived from the version, so
 * several players claiming at once still produce exactly one pass.
 */
export async function claimTimeout(ctx: Ctx, input: unknown): Promise<ActResult | { ok: true; stale: true }> {
  const o = obj(input);
  const roomId = parseRoomId(o.roomId);
  const expectedVersion = parseVersion(o.expectedVersion);
  return ctx.repo.run(async (tx) => {
    const room = await loadRoom(tx, roomId);
    const server = await tx.get<ServerDoc>(PATHS.server(roomId));
    const codeDoc = await tx.get<CodeDoc>(PATHS.code(room.code));
    requirePlayer(room, ctx.uid);
    if (room.status !== 'bermain' || !server?.state || !room.game) throw new RoomError('BILIK_TAMAT', 'failed-precondition');
    const prev = server.state;
    if (prev.version !== expectedVersion) return { ok: true as const, stale: true as const };
    const current = room.players.find((p) => p.uid === room.game!.currentUid);
    const deadlinePassed = room.game.turnDeadline !== null && ctx.now >= room.game.turnDeadline + MP_TIMING.deadlineGraceMs;
    const goneTooLong = !!current && (current.left || ctx.now - current.lastSeen > MP_TIMING.turnDisconnectGraceMs);
    if (!deadlinePassed && !goneTooLong) throw new RoomError('BELUM_TAMAT_MASA', 'failed-precondition');
    const res = applyAction(
      prev,
      { type: 'PASS', reason: 'timeout', id: `timeout-v${prev.version}`, playerId: room.game.currentUid, expectedVersion: prev.version },
      coreLexicon(),
      ctx.now,
    );
    if (!res.ok) return { ok: true as const, stale: true as const };
    commitState(tx, roomId, room, prev, res.state, ctx.now, codeDoc);
    return { ok: true as const, version: res.state.version };
  });
}

// ---------------------------------------------------------------------------
// Presence, leaving, expiry
// ---------------------------------------------------------------------------

/** Keep-alive from an open client; also hands the host role over if the host vanished. */
export async function heartbeat(ctx: Ctx, input: unknown): Promise<{ hostUid: string; status: RoomDoc['status']; serverNow: number }> {
  const o = obj(input);
  const roomId = parseRoomId(o.roomId);
  return ctx.repo.run(async (tx) => {
    const room = await loadRoom(tx, roomId);
    if (room.pending.some((p) => p.uid === ctx.uid)) return { hostUid: room.hostUid, status: room.status, serverNow: ctx.now };
    const me = requirePlayer(room, ctx.uid);
    me.lastSeen = ctx.now;
    const host = room.players.find((p) => p.uid === room.hostUid);
    if (!host || host.left || ctx.now - host.lastSeen > MP_TIMING.hostGraceMs) {
      const next = [...room.players]
        .filter((p) => !p.left && !p.resigned && ctx.now - p.lastSeen < MP_TIMING.connectedMs)
        .sort((a, b) => a.seat - b.seat)[0];
      if (next) room.hostUid = next.uid;
    }
    room.updatedAt = ctx.now;
    tx.set(PATHS.room(roomId), room);
    return { hostUid: room.hostUid, status: room.status, serverNow: ctx.now };
  });
}

/** Leave a room. Before the game: free the seat. During the game: resign. */
export async function leaveRoom(ctx: Ctx, input: unknown): Promise<{ ok: true }> {
  const o = obj(input);
  const roomId = parseRoomId(o.roomId);
  return ctx.repo.run(async (tx) => {
    const room = await loadRoom(tx, roomId);
    const server = await tx.get<ServerDoc>(PATHS.server(roomId));
    const codeDoc = await tx.get<CodeDoc>(PATHS.code(room.code));
    const ownsCode = codeDoc?.roomId === roomId;
    if (room.pending.some((p) => p.uid === ctx.uid)) {
      room.pending = room.pending.filter((p) => p.uid !== ctx.uid);
      room.readerUids = readers(room);
      room.updatedAt = ctx.now;
      tx.set(PATHS.room(roomId), room);
      return { ok: true as const };
    }
    const me = requirePlayer(room, ctx.uid);
    const passHost = () => {
      if (room.hostUid !== ctx.uid) return;
      const next = room.players.filter((p) => !p.left && p.uid !== ctx.uid).sort((a, b) => a.seat - b.seat)[0];
      if (next) room.hostUid = next.uid;
    };
    if (room.status === 'menunggu' || room.status === 'sedia') {
      room.players = room.players.filter((p) => p.uid !== ctx.uid).map((p, seat) => ({ ...p, seat }));
      passHost();
      room.readerUids = readers(room);
      if (room.players.length === 0) {
        room.status = 'tamat-tempoh';
        room.expiresAt = ctx.now;
        if (ownsCode) tx.delete(PATHS.code(room.code));
      } else room.status = lobbyStatus(room);
      room.updatedAt = ctx.now;
      tx.set(PATHS.room(roomId), room);
      return { ok: true as const };
    }
    me.left = true;
    passHost();
    if (room.status === 'bermain' && server?.state && !me.resigned) {
      const prev = server.state;
      prev.rngState = ctx.random.int(0x1_0000_0000) >>> 0;
      const res = applyAction(prev, { type: 'RESIGN', id: `leave-${ctx.uid}`.slice(0, 64), playerId: ctx.uid, expectedVersion: prev.version }, coreLexicon(), ctx.now);
      if (res.ok) {
        commitState(tx, roomId, room, prev, res.state, ctx.now, codeDoc);
        return { ok: true as const };
      }
    }
    room.updatedAt = ctx.now;
    tx.set(PATHS.room(roomId), room);
    return { ok: true as const };
  });
}

/** Scheduled sweep: mark rooms past their expiry as "tamat-tempoh" and free their codes. */
export async function expireRooms(repo: Repo, now: number): Promise<number> {
  const ids = await repo.findExpiredRoomIds(now, 200);
  let n = 0;
  for (const roomId of ids) {
    const changed = await repo.run(async (tx) => {
      const room = await tx.get<RoomDoc>(PATHS.room(roomId));
      if (!room || !ACTIVE.has(room.status) || room.expiresAt >= now) return false;
      const codeDoc = await tx.get<CodeDoc>(PATHS.code(room.code));
      room.status = 'tamat-tempoh';
      room.updatedAt = now;
      if (codeDoc?.roomId === roomId) tx.delete(PATHS.code(room.code));
      tx.set(PATHS.room(roomId), room);
      return true;
    });
    if (changed) n++;
  }
  return n;
}
