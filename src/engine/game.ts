/**
 * Authoritative, pure game state machine.
 *
 *   setup ─createGame→ active(turn N) ─applyAction→ validating
 *        validating ─ok→ applied → next turn (or finished)
 *        validating ─error→ rejected (state unchanged)
 *
 * applyAction never mutates its input. It enforces: game not finished,
 * idempotency (action id), optimistic concurrency (expectedVersion), turn
 * ownership, tile ownership, geometry, dictionary and scoring. The same
 * function is designed to run inside a server transaction for multiplayer.
 */
import { createBag, drawTiles } from './bag';
import { createEmptyBoard, getLayout, idx } from './board';
import type { Lexicon } from './dictionary';
import { JAWI_LETTER_SET, normalizeJawi } from './jawi';
import { analyzePlacement, type ResolvedPlacement } from './placement';
import { Rng } from './rng';
import { rackValue, scoreMove } from './score';
import type { TileDistribution } from './tiles';
import {
  DEFAULT_RULES,
  type ActionResult,
  type Difficulty,
  type EngineError,
  type FormedWord,
  type GameAction,
  type GameResult,
  type GameRules,
  type GameState,
  type Placement,
  type PlayerState,
  type Tile,
  type EndReason,
} from './types';

export interface NewPlayer {
  id: string;
  name: string;
  kind: 'human' | 'bot';
  botLevel?: Difficulty;
}

export interface CreateGameOptions {
  id: string;
  players: NewPlayer[];
  difficulty: Difficulty;
  distribution: TileDistribution;
  seed: number;
  rules?: Partial<GameRules>;
  now?: number;
}

const MAX_REMEMBERED_ACTIONS = 200;

export function createGame(opts: CreateGameOptions): GameState {
  if (opts.players.length < 2 || opts.players.length > 4) throw new Error('A game needs 2–4 players');
  const rules: GameRules = { ...DEFAULT_RULES, ...opts.rules };
  const layout = getLayout(rules.layoutId);
  const rng = new Rng(opts.seed);
  const bag = createBag(opts.distribution, rng);
  const players: PlayerState[] = opts.players.map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    botLevel: p.botLevel,
    score: 0,
    rack: drawTiles(bag, rules.rackSize),
    resigned: false,
  }));
  const now = opts.now ?? Date.now();
  return {
    schema: 1,
    id: opts.id,
    rules,
    difficulty: opts.difficulty,
    phase: 'active',
    version: 0,
    board: createEmptyBoard(layout),
    bag,
    players,
    currentPlayer: 0,
    turn: 1,
    consecutiveScoreless: 0,
    moves: [],
    appliedActionIds: [],
    rngState: rng.state,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Play evaluation (shared by validator, live preview, hints and the bot)
// ---------------------------------------------------------------------------

export type PlayEvaluation =
  | { ok: true; words: FormedWord[]; score: number; wordsTotal: number; allTilesBonus: number; resolved: ResolvedPlacement[] }
  | { ok: false; error: EngineError; words?: FormedWord[]; score?: number };

const err = (code: EngineError['code'], message: string, extra: Partial<EngineError> = {}): EngineError => ({ code, message, ...extra });

export function resolvePlacements(rack: readonly Tile[], placements: readonly Placement[]): { ok: true; resolved: ResolvedPlacement[] } | { ok: false; error: EngineError } {
  const byId = new Map(rack.map((t) => [t.id, t]));
  const used = new Set<string>();
  const resolved: ResolvedPlacement[] = [];
  for (const p of placements) {
    const tile = byId.get(p.tileId);
    if (!tile) return { ok: false, error: err('TILE_NOT_OWNED', 'Jubin itu bukan milik anda.', { cells: [{ x: p.x, y: p.y }] }) };
    if (used.has(p.tileId)) return { ok: false, error: err('DUPLICATE_TILE', 'Jubin yang sama digunakan dua kali.') };
    used.add(p.tileId);
    let letter = tile.letter;
    if (tile.isBlank) {
      const chosen = normalizeJawi(p.letter ?? '');
      if (!chosen) return { ok: false, error: err('BLANK_NEEDS_LETTER', 'Pilih huruf untuk jubin joker dahulu.', { cells: [{ x: p.x, y: p.y }] }) };
      if (!JAWI_LETTER_SET.has(chosen)) return { ok: false, error: err('INVALID_LETTER', 'Huruf joker tidak sah.', { cells: [{ x: p.x, y: p.y }] }) };
      letter = chosen;
    }
    resolved.push({ tileId: tile.id, x: p.x, y: p.y, letter, value: tile.isBlank ? 0 : tile.value, isBlank: tile.isBlank });
  }
  return { ok: true, resolved };
}

/** Full legality check + score for a prospective play. Pure. */
export function evaluatePlay(state: GameState, playerIndex: number, placements: readonly Placement[], lexicon: Lexicon): PlayEvaluation {
  const player = state.players[playerIndex];
  if (!player) return { ok: false, error: err('UNKNOWN_PLAYER', 'Pemain tidak dikenali.') };
  const res = resolvePlacements(player.rack, placements);
  if (!res.ok) return { ok: false, error: res.error };
  const layout = getLayout(state.rules.layoutId);
  const analysis = analyzePlacement(state.board, layout, res.resolved, state.rules);
  if (!analysis.ok) return { ok: false, error: analysis.error };
  const score = scoreMove(analysis.words, res.resolved.length, state.rules);
  const unknown = analysis.words.filter((w) => !lexicon.has(w.text));
  if (unknown.length) {
    const list = [...new Set(unknown.map((w) => w.text))];
    return {
      ok: false,
      error: err('UNKNOWN_WORD', `Ejaan belum ditemui dalam kamus: ${list.join('، ')}`, {
        words: list,
        cells: unknown.flatMap((w) => w.cells.map(({ x, y }) => ({ x, y }))),
      }),
      words: analysis.words,
      score: score.total,
    };
  }
  return { ok: true, words: analysis.words, score: score.total, wordsTotal: score.wordsTotal, allTilesBonus: score.allTilesBonus, resolved: res.resolved };
}

// ---------------------------------------------------------------------------
// Turn helpers
// ---------------------------------------------------------------------------

export const activePlayers = (s: GameState) => s.players.filter((p) => !p.resigned);

export function canSwap(s: GameState, count = 1): boolean {
  return s.bag.length >= Math.max(s.rules.minBagForSwap, count);
}

function advanceTurn(s: GameState) {
  const n = s.players.length;
  for (let step = 1; step <= n; step++) {
    const next = (s.currentPlayer + step) % n;
    if (!s.players[next]!.resigned) {
      s.currentPlayer = next;
      break;
    }
  }
  s.turn += 1;
}

function finish(s: GameState, reason: EndReason, now: number) {
  for (const p of s.players) {
    // Leftover tiles are deducted once when the game ends naturally. A win by
    // resignation does not penalise the remaining player.
    if (p.resigned || reason === 'resign') continue;
    const penalty = rackValue(p.rack);
    p.endPenalty = penalty;
    p.score -= penalty;
  }
  const contenders = activePlayers(s);
  const best = Math.max(...contenders.map((p) => p.score));
  const winners = contenders.filter((p) => p.score === best).map((p) => p.id);
  const result: GameResult = {
    reason,
    winners,
    isTie: winners.length > 1,
    finalScores: s.players.map((p) => ({ playerId: p.id, score: p.score, penalty: p.endPenalty ?? 0, resigned: p.resigned })),
    finishedAt: now,
  };
  s.result = result;
  s.phase = 'finished';
}

function checkScoreless(s: GameState, now: number): boolean {
  const limit = s.rules.scorelessRoundsLimit * activePlayers(s).length;
  if (s.consecutiveScoreless >= limit) {
    finish(s, 'scoreless', now);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// applyAction — the only way state changes
// ---------------------------------------------------------------------------

export function applyAction(prev: GameState, action: GameAction, lexicon: Lexicon, now: number = Date.now()): ActionResult {
  if (prev.phase === 'finished') return { ok: false, error: err('GAME_FINISHED', 'Permainan sudah tamat.') };
  if (prev.appliedActionIds.includes(action.id)) return { ok: false, error: err('DUPLICATE_ACTION', 'Tindakan ini sudah diproses.') };
  if (action.expectedVersion !== prev.version) {
    return { ok: false, error: err('STALE_VERSION', 'Keadaan permainan telah berubah. Sila cuba semula.') };
  }
  const playerIndex = prev.players.findIndex((p) => p.id === action.playerId);
  if (playerIndex < 0) return { ok: false, error: err('UNKNOWN_PLAYER', 'Pemain tidak dikenali.') };
  if (prev.players[playerIndex]!.resigned) return { ok: false, error: err('NOT_YOUR_TURN', 'Anda telah menarik diri daripada permainan ini.') };
  if (action.type !== 'RESIGN' && playerIndex !== prev.currentPlayer) {
    return { ok: false, error: err('NOT_YOUR_TURN', 'Bukan giliran anda. Menunggu pemain lain…') };
  }

  const s: GameState = structuredClone(prev);
  const player = s.players[playerIndex]!;
  const rng = new Rng(s.rngState);
  const record = (r: Omit<GameState['moves'][number], 'index' | 'turn' | 'playerId' | 'at'>) =>
    s.moves.push({ index: s.moves.length, turn: s.turn, playerId: player.id, at: now, ...r });
  const commit = () => {
    s.version += 1;
    s.appliedActionIds = [...s.appliedActionIds, action.id].slice(-MAX_REMEMBERED_ACTIONS);
    s.rngState = rng.state;
    s.updatedAt = now;
  };

  switch (action.type) {
    case 'PLAY': {
      const ev = evaluatePlay(prev, playerIndex, action.placements, lexicon);
      if (!ev.ok) return { ok: false, error: ev.error };
      const size = getLayout(s.rules.layoutId).size;
      const moveIndex = s.moves.length;
      for (const r of ev.resolved) {
        s.board[idx(size, r.x, r.y)] = { letter: r.letter, value: r.value, isBlank: r.isBlank, tileId: r.tileId, moveIndex };
      }
      const usedIds = new Set(ev.resolved.map((r) => r.tileId));
      player.rack = player.rack.filter((t) => !usedIds.has(t.id));
      const drawn = drawTiles(s.bag, s.rules.rackSize - player.rack.length);
      player.rack.push(...drawn);
      player.score += ev.score;
      s.consecutiveScoreless = ev.score > 0 ? 0 : s.consecutiveScoreless + 1;
      record({
        type: 'play',
        score: ev.score,
        words: ev.words.map((w) => ({ text: w.text, score: w.score })),
        placements: ev.resolved.map((r) => ({ x: r.x, y: r.y, letter: r.letter, isBlank: r.isBlank })),
        allTilesBonus: ev.allTilesBonus > 0,
      });
      if (player.rack.length === 0 && s.bag.length === 0) finish(s, 'rack-out', now);
      else if (!checkScoreless(s, now)) advanceTurn(s);
      commit();
      return { ok: true, state: s, event: { kind: 'play', playerId: player.id, score: ev.score, words: ev.words, allTilesBonus: ev.allTilesBonus > 0, drew: drawn.length } };
    }
    case 'SWAP': {
      const ids = action.tileIds;
      if (ids.length === 0) return { ok: false, error: err('SWAP_NONE', 'Pilih sekurang-kurangnya satu jubin untuk ditukar.') };
      if (new Set(ids).size !== ids.length) return { ok: false, error: err('DUPLICATE_TILE', 'Jubin yang sama dipilih dua kali.') };
      if (!ids.every((id) => player.rack.some((t) => t.id === id))) return { ok: false, error: err('TILE_NOT_OWNED', 'Jubin itu bukan milik anda.') };
      if (!canSwap(s, ids.length)) {
        return {
          ok: false,
          error: err('SWAP_BAG_LOW', `Tidak boleh tukar: beg perlu ada sekurang-kurangnya ${Math.max(s.rules.minBagForSwap, ids.length)} jubin (tinggal ${s.bag.length}).`),
        };
      }
      const out = player.rack.filter((t) => ids.includes(t.id));
      player.rack = player.rack.filter((t) => !ids.includes(t.id));
      player.rack.push(...drawTiles(s.bag, out.length));
      s.bag.push(...out);
      rng.shuffle(s.bag);
      s.consecutiveScoreless += 1;
      record({ type: 'swap', score: 0, words: [], placements: [], swapped: out.length });
      if (!checkScoreless(s, now)) advanceTurn(s);
      commit();
      return { ok: true, state: s, event: { kind: 'swap', playerId: player.id, count: out.length } };
    }
    case 'PASS': {
      s.consecutiveScoreless += 1;
      const timeout = action.reason === 'timeout';
      record({ type: timeout ? 'timeout' : 'pass', score: 0, words: [], placements: [] });
      if (!checkScoreless(s, now)) advanceTurn(s);
      commit();
      return { ok: true, state: s, event: { kind: 'pass', playerId: player.id, timeout } };
    }
    case 'RESIGN': {
      player.resigned = true;
      s.bag.push(...player.rack);
      player.rack = [];
      rng.shuffle(s.bag);
      record({ type: 'resign', score: 0, words: [], placements: [] });
      if (activePlayers(s).length <= 1) finish(s, 'resign', now);
      else if (s.currentPlayer === playerIndex) advanceTurn(s);
      commit();
      return { ok: true, state: s, event: { kind: 'resign', playerId: player.id } };
    }
  }
}

/** Last formed word on the board (for HUD "perkataan terakhir"). */
export function lastPlayedWord(s: GameState): { text: string; score: number; playerId: string } | null {
  for (let i = s.moves.length - 1; i >= 0; i--) {
    const m = s.moves[i]!;
    if (m.type === 'play' && m.words[0]) return { text: m.words[0].text, score: m.score, playerId: m.playerId };
  }
  return null;
}
