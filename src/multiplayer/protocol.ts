/**
 * Shared multiplayer contract between the browser client and the
 * authoritative game server (Cloud Functions). Pure types + constants only.
 *
 * Firestore layout
 *   roomCodes/{code}              { roomId, expiresAt }            — no client access
 *   rooms/{roomId}                RoomDoc (public, members only)   — read: readerUids
 *   rooms/{roomId}/hands/{uid}    HandDoc (private rack)           — read: owner only
 *   rooms/{roomId}/moves/{n}      MoveDoc (log)                    — read: members
 *   serverState/{roomId}          { state: GameState | null }      — no client access
 *   rateLimits/{uid}              per-user counters                — no client access
 * Clients never write: every change goes through a callable function.
 */
import type { BoardCells } from '../engine/board';
import type { Difficulty, EndReason, GameRules, MoveRecord, Placement, Tile } from '../engine/types';

export type RoomStatus = 'menunggu' | 'sedia' | 'bermain' | 'tamat' | 'tamat-tempoh';

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  menunggu: 'Menunggu pemain',
  sedia: 'Sedia untuk bermula',
  bermain: 'Sedang bermain',
  tamat: 'Tamat',
  'tamat-tempoh': 'Tamat tempoh',
};

export interface RoomSettings {
  /** Room-wide assist preset (hints / timer defaults) — never a per-player advantage. */
  difficulty: Difficulty;
  turnSeconds: number | null;
  maxPlayers: 2 | 3 | 4;
  requireApproval: boolean;
}

export const TURN_SECONDS_OPTIONS = [null, 60, 90, 120] as const;
export const HINTS_PER_PLAYER: Record<Difficulty, number | null> = { mudah: null, sederhana: 3, sukar: 1 };

export interface PublicPlayer {
  uid: string;
  nickname: string;
  seat: number;
  ready: boolean;
  joinedAt: number;
  lastSeen: number;
  score: number;
  rackCount: number;
  resigned: boolean;
  left: boolean;
}

export interface PendingPlayer {
  uid: string;
  nickname: string;
  requestedAt: number;
}

export interface PublicMove {
  uid: string;
  type: MoveRecord['type'];
  score: number;
  words: { text: string; score: number }[];
  placements: MoveRecord['placements'];
  swapped?: number;
  allTilesBonus?: boolean;
  at: number;
}

export interface PublicResult {
  reason: EndReason;
  winners: string[];
  isTie: boolean;
  finalScores: { uid: string; score: number; penalty: number; resigned: boolean }[];
}

export interface PublicGame {
  version: number;
  board: BoardCells;
  bagCount: number;
  currentUid: string;
  turn: number;
  turnDeadline: number | null;
  consecutiveScoreless: number;
  rules: GameRules;
  lastMove: PublicMove | null;
  moveCount: number;
  result: PublicResult | null;
}

export interface RoomDoc {
  code: string;
  status: RoomStatus;
  hostUid: string;
  settings: RoomSettings;
  players: PublicPlayer[];
  pending: PendingPlayer[];
  /** Everyone allowed to read this document (players + pending requests). */
  readerUids: string[];
  game: PublicGame | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface HandDoc {
  rack: Tile[];
  version: number;
}

// ---- callable requests -------------------------------------------------------

export interface CreateRoomRequest {
  code: string;
  nickname: string;
  settings: RoomSettings;
}
export interface JoinRoomRequest {
  code: string;
  nickname: string;
}
export interface RoomRef {
  roomId: string;
}
export interface ActRequest extends RoomRef {
  actionId: string;
  expectedVersion: number;
}
export type GameActionRequest =
  | (ActRequest & { kind: 'play'; placements: Placement[] })
  | (ActRequest & { kind: 'swap'; tileIds: string[] })
  | (ActRequest & { kind: 'pass' })
  | (ActRequest & { kind: 'resign' });

export interface ActResult {
  ok: true;
  version: number;
  duplicate?: boolean;
  score?: number;
}

// ---- errors -----------------------------------------------------------------

export type RoomErrorReason =
  | 'TIDAK_SAH'
  | 'KOD_DIGUNAKAN'
  | 'KOD_TIDAK_SAH'
  | 'BILIK_PENUH'
  | 'SUDAH_BERMULA'
  | 'BUKAN_AHLI'
  | 'BUKAN_HOS'
  | 'BELUM_SEDIA'
  | 'TERLALU_BANYAK_CUBAAN'
  | 'BELUM_TAMAT_MASA'
  | 'LANGKAH_DITOLAK'
  | 'BILIK_TAMAT';

export const ROOM_ERROR_MESSAGE: Record<RoomErrorReason, string> = {
  TIDAK_SAH: 'Permintaan tidak sah.',
  KOD_DIGUNAKAN: 'Kod bilik ini sedang digunakan. Sila pilih kod 4 digit yang lain.',
  KOD_TIDAK_SAH: 'Kod bilik tidak sah atau sudah tamat tempoh.',
  BILIK_PENUH: 'Bilik sudah penuh.',
  SUDAH_BERMULA: 'Permainan dalam bilik ini sudah bermula.',
  BUKAN_AHLI: 'Anda bukan pemain dalam bilik ini.',
  BUKAN_HOS: 'Hanya hos boleh melakukan tindakan ini.',
  BELUM_SEDIA: 'Perlukan 2–4 pemain dan semua pemain mesti SEDIA.',
  TERLALU_BANYAK_CUBAAN: 'Terlalu banyak cubaan. Tunggu sebentar dan cuba lagi.',
  BELUM_TAMAT_MASA: 'Masa giliran belum tamat.',
  LANGKAH_DITOLAK: 'Langkah ditolak.',
  BILIK_TAMAT: 'Bilik ini sudah tamat.',
};

/** Exactly four decimal digits, leading zeros kept ("0427"). Always a string. */
export const ROOM_CODE_RE = /^\d{4}$/;

export const MP_TIMING = {
  /** A waiting/playing room expires this long after its last activity. */
  activeTtlMs: 2 * 60 * 60 * 1000,
  /** Finished rooms stay readable for results, then expire. */
  finishedTtlMs: 24 * 60 * 60 * 1000,
  heartbeatMs: 25_000,
  /** Shown as disconnected after this long without a heartbeat. */
  connectedMs: 70_000,
  /** Host role moves to another player after this long without a heartbeat. */
  hostGraceMs: 90_000,
  /** A disconnected player's turn can be skipped after this long (no timer). */
  turnDisconnectGraceMs: 120_000,
  /** Extra seconds after a turn deadline before others may claim the timeout. */
  deadlineGraceMs: 2_000,
} as const;

export const isConnected = (p: Pick<PublicPlayer, 'lastSeen' | 'left'>, now: number) => !p.left && now - p.lastSeen < MP_TIMING.connectedMs;
