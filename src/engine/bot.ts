/**
 * Offline opponent. A real search, not a script:
 *   1. enumerate every approved, tile-playable dictionary word × orientation ×
 *      board position (RTL horizontal / top-down vertical);
 *   2. keep positions that fit existing letters, connect to the board (or
 *      cross the centre on move one) and can be built from the rack (+ joker);
 *   3. run the SAME evaluatePlay() used for human moves — so every candidate
 *      has all cross-words dictionary-checked and a real score;
 *   4. choose with a difficulty-specific strategy.
 */
import { BONUS_META, getLayout, idx, inBounds, isBoardEmpty } from './board';
import type { Lexicon } from './dictionary';
import { canSwap, evaluatePlay } from './game';
import { splitLetters } from './jawi';
import type { Rng } from './rng';
import type { Difficulty, FormedWord, GameState, Placement, Tile } from './types';

export interface MoveCandidate {
  placements: Placement[];
  words: FormedWord[];
  score: number;
  mainWord: string;
  tilesUsed: number;
  usesBlank: boolean;
}

export type BotDecision =
  | { type: 'PLAY'; placements: Placement[]; candidate: MoveCandidate }
  | { type: 'SWAP'; tileIds: string[] }
  | { type: 'PASS' };

export interface GenerateOptions {
  /** Stop after this many legal candidates (performance guard). */
  maxCandidates?: number;
}

export function generateMoves(state: GameState, playerIndex: number, lexicon: Lexicon, opts: GenerateOptions = {}): MoveCandidate[] {
  const player = state.players[playerIndex];
  if (!player || player.rack.length === 0) return [];
  const layout = getLayout(state.rules.layoutId);
  const size = layout.size;
  const board = state.board;
  const empty = isBoardEmpty(board);
  const maxCandidates = opts.maxCandidates ?? 5000;

  const letterAt = (x: number, y: number) => (inBounds(size, x, y) ? (board[idx(size, x, y)]?.letter ?? null) : null);
  const occupied = (x: number, y: number) => letterAt(x, y) !== null;

  const realByLetter = new Map<string, Tile[]>();
  const blanks: Tile[] = [];
  for (const t of player.rack) {
    if (t.isBlank) blanks.push(t);
    else realByLetter.set(t.letter, [...(realByLetter.get(t.letter) ?? []), t]);
  }

  const seen = new Set<string>();
  const out: MoveCandidate[] = [];

  const tryPositions = (letters: string[], cells: { x: number; y: number }[], perpendicular: (x: number, y: number) => boolean) => {
    const needs: { x: number; y: number; letter: string }[] = [];
    let usesExisting = false;
    for (let i = 0; i < letters.length; i++) {
      const { x, y } = cells[i]!;
      const existing = letterAt(x, y);
      if (existing !== null) {
        if (existing !== letters[i]) return;
        usesExisting = true;
      } else needs.push({ x, y, letter: letters[i]! });
    }
    if (needs.length === 0 || needs.length > player.rack.length) return;
    if (empty) {
      if (!needs.some((n) => n.x === layout.center.x && n.y === layout.center.y)) return;
      if (letters.length < state.rules.firstWordMinLength) return;
    } else if (!usesExisting && !needs.some((n) => perpendicular(n.x, n.y))) return;

    // Allocate rack tiles: real tiles first, jokers for the deficit.
    const pool = new Map([...realByLetter].map(([k, v]) => [k, [...v]]));
    const freeBlanks = [...blanks];
    const placements: Placement[] = [];
    let usesBlank = false;
    for (const n of needs) {
      const real = pool.get(n.letter)?.pop();
      if (real) placements.push({ tileId: real.id, x: n.x, y: n.y });
      else {
        const b = freeBlanks.pop();
        if (!b) return;
        usesBlank = true;
        placements.push({ tileId: b.id, x: n.x, y: n.y, letter: n.letter });
      }
    }
    const key = placements.map((p) => `${p.x},${p.y},${p.letter ?? ''}${p.tileId}`).sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    const ev = evaluatePlay(state, playerIndex, placements, lexicon);
    if (!ev.ok) return;
    const main = ev.words.find((w) => w.isMain) ?? ev.words[0]!;
    out.push({ placements, words: ev.words, score: ev.score, mainWord: main.text, tilesUsed: placements.length, usesBlank });
  };

  for (const word of lexicon.playableWords) {
    if (out.length >= maxCandidates) break;
    const letters = splitLetters(word);
    const n = letters.length;
    if (n > size) continue;
    // Horizontal: logical letter i sits at x = startX − i (right → left).
    for (let y = 0; y < size; y++) {
      for (let startX = n - 1; startX < size; startX++) {
        if (occupied(startX + 1, y) || occupied(startX - n, y)) continue;
        const cells = letters.map((_, i) => ({ x: startX - i, y }));
        tryPositions(letters, cells, (x, yy) => occupied(x, yy - 1) || occupied(x, yy + 1));
      }
    }
    // Vertical: logical letter i sits at y = startY + i (top → bottom).
    for (let x = 0; x < size; x++) {
      for (let startY = 0; startY + n <= size; startY++) {
        if (occupied(x, startY - 1) || occupied(x, startY + n)) continue;
        const cells = letters.map((_, i) => ({ x, y: startY + i }));
        tryPositions(letters, cells, (xx, y) => occupied(xx - 1, y) || occupied(xx + 1, y));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

const VOWELISH = new Set(['ا', 'و', 'ي']);

/** Heuristic value of the tiles kept after a move (higher = better rack). */
export function leaveValue(rack: readonly Tile[]): number {
  let v = 0;
  const counts = new Map<string, number>();
  let vowels = 0;
  for (const t of rack) {
    if (t.isBlank) {
      v += 6;
      continue;
    }
    counts.set(t.letter, (counts.get(t.letter) ?? 0) + 1);
    if (VOWELISH.has(t.letter)) vowels++;
    if (t.value >= 7) v -= 3;
  }
  for (const c of counts.values()) if (c > 1) v -= 2 * (c - 1);
  if (rack.length > 0) {
    if (vowels === 0) v -= 4;
    else if (vowels > 3) v -= 2 * (vowels - 3);
    else v += 2;
  }
  return v;
}

/** Penalty for opening premium squares to the opponent. */
function exposurePenalty(state: GameState, c: MoveCandidate): number {
  const layout = getLayout(state.rules.layoutId);
  const size = layout.size;
  let penalty = 0;
  for (let i = 0; i < layout.bonuses.length; i++) {
    const b = layout.bonuses[i];
    if (!b || state.board[i]) continue;
    const bx = i % size;
    const by = Math.floor(i / size);
    if (c.placements.some((p) => p.x === bx && p.y === by)) continue;
    const near = c.placements.some((p) => Math.max(Math.abs(p.x - bx), Math.abs(p.y - by)) <= (b === 'W3' ? 2 : 1));
    if (near) penalty += BONUS_META[b].wordMult === 3 ? 4 : BONUS_META[b].wordMult === 2 ? 1.5 : BONUS_META[b].letterMult === 3 ? 1 : 0.5;
  }
  return penalty;
}

function rackAfter(rack: readonly Tile[], c: MoveCandidate): Tile[] {
  const used = new Set(c.placements.map((p) => p.tileId));
  return rack.filter((t) => !used.has(t.id));
}

/** Tiles a bot would like to get rid of (duplicates, rare letters). */
export function worstTiles(rack: readonly Tile[], max: number): string[] {
  const seen = new Map<string, number>();
  const scored = rack.map((t) => {
    const dup = (seen.get(t.letter) ?? 0) > 0;
    seen.set(t.letter, (seen.get(t.letter) ?? 0) + 1);
    const badness = t.isBlank ? -10 : (dup ? 4 : 0) + (t.value >= 7 ? 3 : 0) + (VOWELISH.has(t.letter) ? -1 : 0);
    return { id: t.id, badness };
  });
  return scored
    .filter((s) => s.badness > 0)
    .sort((a, b) => b.badness - a.badness)
    .slice(0, max)
    .map((s) => s.id);
}

export function chooseBotMove(state: GameState, playerIndex: number, lexicon: Lexicon, level: Difficulty, rng: Rng): BotDecision {
  const player = state.players[playerIndex]!;
  const candidates = generateMoves(state, playerIndex, lexicon);

  const fallback = (): BotDecision => {
    if (!canSwap(state, 1)) return { type: 'PASS' };
    // Nothing (good) to play: refresh most of the rack, keeping jokers and
    // at most two distinct "vowel" carriers (ا و ي) which nearly every word needs.
    const keep = new Set<string>();
    const keptVowels = new Set<string>();
    for (const t of player.rack) {
      if (t.isBlank) keep.add(t.id);
      else if (level !== 'mudah' && VOWELISH.has(t.letter) && !keptVowels.has(t.letter) && keptVowels.size < 2) {
        keep.add(t.id);
        keptVowels.add(t.letter);
      }
    }
    let ids = player.rack.filter((t) => !keep.has(t.id)).map((t) => t.id);
    if (ids.length === 0) ids = player.rack.filter((t) => !t.isBlank).map((t) => t.id);
    ids = ids.slice(0, state.bag.length);
    return ids.length > 0 && canSwap(state, ids.length) ? { type: 'SWAP', tileIds: ids } : { type: 'PASS' };
  };

  if (candidates.length === 0) return fallback();
  const play = (c: MoveCandidate): BotDecision => ({ type: 'PLAY', placements: c.placements, candidate: c });

  if (level === 'mudah') {
    // Small random sample, prefers short familiar words, plays a modest move.
    const familiar = candidates.filter((c) => c.tilesUsed <= 4 && !c.usesBlank && lexicon.difficultyOf(c.mainWord) === 1);
    const pool = familiar.length > 0 ? familiar : candidates;
    const sample: MoveCandidate[] = [];
    const copy = [...pool];
    rng.shuffle(copy);
    for (const c of copy.slice(0, 6)) sample.push(c);
    sample.sort((a, b) => a.score - b.score);
    return play(sample[Math.floor((sample.length - 1) / 2)]!);
  }

  if (level === 'sederhana') {
    // Evaluates everything; picks from the top quarter, weighted by score,
    // with a small bonus for familiar vocabulary.
    const ranked = [...candidates]
      .map((c) => ({ c, v: c.score + (lexicon.difficultyOf(c.mainWord) === 1 ? 2 : 0) - (c.usesBlank ? 3 : 0) }))
      .sort((a, b) => b.v - a.v);
    const top = ranked.slice(0, Math.max(1, Math.min(12, Math.ceil(ranked.length / 4))));
    const total = top.reduce((a, t) => a + Math.max(1, t.v), 0);
    let r = rng.next() * total;
    for (const t of top) {
      r -= Math.max(1, t.v);
      if (r <= 0) return play(t.c);
    }
    return play(top[0]!.c);
  }

  // SUKAR: score + rack leave − board exposure; consistently picks the best.
  let best: MoveCandidate | null = null;
  let bestValue = -Infinity;
  for (const c of candidates) {
    const leave = rackAfter(player.rack, c);
    const blankCost = c.usesBlank && c.score < 25 ? 8 : 0;
    const v = c.score + leaveValue(leave) * 0.8 - exposurePenalty(state, c) - blankCost;
    if (v > bestValue || (v === bestValue && rng.next() < 0.5)) {
      best = c;
      bestValue = v;
    }
  }
  if (best && best.score < 6 && state.bag.length >= 14 && leaveValue(player.rack) < -4) {
    const swap = fallback();
    if (swap.type === 'SWAP') return swap;
  }
  return play(best!);
}

/** Suggest a move for the human player (hint). Prefers clear, familiar words. */
export function suggestMove(state: GameState, playerIndex: number, lexicon: Lexicon, level: Difficulty): MoveCandidate | null {
  const candidates = generateMoves(state, playerIndex, lexicon);
  if (candidates.length === 0) return null;
  const rank = (c: MoveCandidate) =>
    c.score + (level === 'mudah' && lexicon.difficultyOf(c.mainWord) === 1 ? 6 : 0) - (c.usesBlank ? 4 : 0);
  return [...candidates].sort((a, b) => rank(b) - rank(a))[0]!;
}
