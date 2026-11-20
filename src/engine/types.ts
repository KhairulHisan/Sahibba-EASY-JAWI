import type { Bonus, BoardCells } from './board';

export type Difficulty = 'mudah' | 'sederhana' | 'sukar';
export type Orientation = 'H' | 'V';

export interface Tile {
  id: string;
  /** Letter for normal tiles; '' for an unassigned blank (joker). */
  letter: string;
  value: number;
  isBlank: boolean;
}

/** One tile the player wants to put on the board this turn. */
export interface Placement {
  tileId: string;
  x: number;
  y: number;
  /** Required when the tile is a blank: the chosen Jawi letter. */
  letter?: string;
}

export interface PlayerState {
  id: string;
  name: string;
  kind: 'human' | 'bot';
  botLevel?: Difficulty;
  score: number;
  rack: Tile[];
  resigned: boolean;
  /** Points deducted for tiles left at game end (applied exactly once). */
  endPenalty?: number;
}

export interface GameRules {
  layoutId: string;
  rackSize: number;
  /** Bonus for using every rack tile in one move. */
  allTilesBonus: number;
  /** Game ends after this many full rounds of scoreless turns. */
  scorelessRoundsLimit: number;
  /** Bag must hold at least this many tiles to allow a swap. */
  minBagForSwap: number;
  /** Minimum tiles in the first word. */
  firstWordMinLength: number;
}

export const DEFAULT_RULES: GameRules = {
  layoutId: 'wau-13',
  rackSize: 7,
  allTilesBonus: 40,
  scorelessRoundsLimit: 3,
  minBagForSwap: 7,
  firstWordMinLength: 2,
};

export interface FormedWordCell {
  x: number;
  y: number;
  letter: string;
  value: number;
  isNew: boolean;
  isBlank: boolean;
  bonus?: Bonus;
}

export interface FormedWord {
  /** Logical Unicode string (first letter = rightmost/topmost). Never reversed. */
  text: string;
  orientation: Orientation;
  /** Cells in logical reading order. */
  cells: FormedWordCell[];
  score: number;
  isMain: boolean;
}

export interface MoveRecord {
  index: number;
  turn: number;
  playerId: string;
  type: 'play' | 'swap' | 'pass' | 'resign' | 'timeout';
  score: number;
  words: { text: string; score: number }[];
  placements: { x: number; y: number; letter: string; isBlank: boolean }[];
  swapped?: number;
  allTilesBonus?: boolean;
  at: number;
}

export type EndReason = 'rack-out' | 'scoreless' | 'resign';

export interface GameResult {
  reason: EndReason;
  winners: string[];
  isTie: boolean;
  finalScores: { playerId: string; score: number; penalty: number; resigned: boolean }[];
  finishedAt: number;
}

export interface GameState {
  schema: 1;
  id: string;
  rules: GameRules;
  difficulty: Difficulty;
  phase: 'active' | 'finished';
  /** Increments on every applied action (compare-and-swap token). */
  version: number;
  board: BoardCells;
  bag: Tile[];
  players: PlayerState[];
  currentPlayer: number;
  turn: number;
  consecutiveScoreless: number;
  moves: MoveRecord[];
  /** Recently applied action ids, for idempotency. */
  appliedActionIds: string[];
  rngState: number;
  result?: GameResult;
  createdAt: number;
  updatedAt: number;
}

interface ActionBase {
  /** Idempotency key — a resubmitted action with the same id is rejected. */
  id: string;
  playerId: string;
  /** Must equal GameState.version (optimistic concurrency). */
  expectedVersion: number;
}

export type GameAction =
  | (ActionBase & { type: 'PLAY'; placements: Placement[] })
  | (ActionBase & { type: 'SWAP'; tileIds: string[] })
  | (ActionBase & { type: 'PASS'; reason?: 'timeout' })
  | (ActionBase & { type: 'RESIGN' });

export type EngineErrorCode =
  | 'GAME_FINISHED'
  | 'DUPLICATE_ACTION'
  | 'STALE_VERSION'
  | 'NOT_YOUR_TURN'
  | 'UNKNOWN_PLAYER'
  | 'NO_TILES'
  | 'OFF_BOARD'
  | 'OCCUPIED'
  | 'DUPLICATE_CELL'
  | 'TILE_NOT_OWNED'
  | 'DUPLICATE_TILE'
  | 'BLANK_NEEDS_LETTER'
  | 'INVALID_LETTER'
  | 'NOT_COLLINEAR'
  | 'GAP'
  | 'FIRST_MOVE_CENTER'
  | 'FIRST_MOVE_TOO_SHORT'
  | 'NOT_CONNECTED'
  | 'NO_WORD'
  | 'UNKNOWN_WORD'
  | 'SWAP_NONE'
  | 'SWAP_BAG_LOW';

export interface EngineError {
  code: EngineErrorCode;
  /** User-facing message in Bahasa Melayu. */
  message: string;
  words?: string[];
  cells?: { x: number; y: number }[];
}

export type GameEvent =
  | { kind: 'play'; playerId: string; score: number; words: FormedWord[]; allTilesBonus: boolean; drew: number }
  | { kind: 'swap'; playerId: string; count: number }
  | { kind: 'pass'; playerId: string; timeout: boolean }
  | { kind: 'resign'; playerId: string };

export type ActionResult =
  | { ok: true; state: GameState; event: GameEvent }
  | { ok: false; error: EngineError };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** An action before the transport layer adds its idempotency key and version. */
export type ActionDraft = DistributiveOmit<GameAction, 'id' | 'expectedVersion'>;
