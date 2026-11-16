import { bonusAt, idx, inBounds, isBoardEmpty, type BoardCells, type BoardLayout } from './board';
import { scoreWord } from './score';
import type { EngineError, FormedWord, FormedWordCell, GameRules, Orientation } from './types';

/** A placement with its tile already resolved from the rack. */
export interface ResolvedPlacement {
  tileId: string;
  x: number;
  y: number;
  letter: string;
  value: number;
  isBlank: boolean;
}

export type PlacementAnalysis =
  | { ok: true; orientation: Orientation; words: FormedWord[]; main: FormedWord; firstMove: boolean }
  | { ok: false; error: EngineError };

const fail = (error: EngineError): PlacementAnalysis => ({ ok: false, error });

/**
 * Geometric validation + word extraction for a set of new tiles.
 * Does NOT consult the dictionary (see evaluatePlay in game.ts).
 *
 * Horizontal words are read RIGHT → LEFT (x decreasing), vertical words
 * TOP → BOTTOM (y increasing). Returned word texts are logical Unicode
 * strings built in reading order — they are never reversed.
 */
export function analyzePlacement(
  board: BoardCells,
  layout: BoardLayout,
  placements: readonly ResolvedPlacement[],
  rules: Pick<GameRules, 'firstWordMinLength'>,
): PlacementAnalysis {
  const size = layout.size;
  if (placements.length === 0) return fail({ code: 'NO_TILES', message: 'Letakkan sekurang-kurangnya satu jubin di papan.' });

  const off = placements.filter((p) => !inBounds(size, p.x, p.y));
  if (off.length) return fail({ code: 'OFF_BOARD', message: 'Jubin berada di luar papan.', cells: off.map(({ x, y }) => ({ x, y })) });

  const occupied = placements.filter((p) => board[idx(size, p.x, p.y)] !== null);
  if (occupied.length) {
    return fail({ code: 'OCCUPIED', message: 'Petak itu sudah berisi jubin.', cells: occupied.map(({ x, y }) => ({ x, y })) });
  }

  const newAt = new Map<number, ResolvedPlacement>();
  for (const p of placements) {
    const k = idx(size, p.x, p.y);
    if (newAt.has(k)) return fail({ code: 'DUPLICATE_CELL', message: 'Dua jubin tidak boleh berada di petak yang sama.', cells: [{ x: p.x, y: p.y }] });
    newAt.set(k, p);
  }

  const first = placements[0]!;
  let orientation: Orientation | null = null;
  if (placements.length > 1) {
    if (placements.every((p) => p.y === first.y)) orientation = 'H';
    else if (placements.every((p) => p.x === first.x)) orientation = 'V';
    else {
      return fail({
        code: 'NOT_COLLINEAR',
        message: 'Semua jubin mesti dalam satu baris — mendatar atau menegak sahaja.',
        cells: placements.map(({ x, y }) => ({ x, y })),
      });
    }
  }

  const has = (x: number, y: number) => inBounds(size, x, y) && (newAt.has(idx(size, x, y)) || board[idx(size, x, y)] !== null);

  // Contiguity: every cell between the outermost new tiles must be filled.
  if (orientation) {
    const gaps: { x: number; y: number }[] = [];
    if (orientation === 'H') {
      const xs = placements.map((p) => p.x);
      for (let x = Math.min(...xs); x <= Math.max(...xs); x++) if (!has(x, first.y)) gaps.push({ x, y: first.y });
    } else {
      const ys = placements.map((p) => p.y);
      for (let y = Math.min(...ys); y <= Math.max(...ys); y++) if (!has(first.x, y)) gaps.push({ x: first.x, y });
    }
    if (gaps.length) return fail({ code: 'GAP', message: 'Jubin perlu bersambung tanpa petak kosong di antaranya.', cells: gaps });
  }

  const firstMove = isBoardEmpty(board);
  if (firstMove) {
    const { x: cx, y: cy } = layout.center;
    if (!newAt.has(idx(size, cx, cy))) {
      return fail({ code: 'FIRST_MOVE_CENTER', message: 'Perkataan pertama mesti melalui petak tengah ★.', cells: [{ x: cx, y: cy }] });
    }
    if (placements.length < rules.firstWordMinLength) {
      return fail({
        code: 'FIRST_MOVE_TOO_SHORT',
        message: `Perkataan pertama mesti sekurang-kurangnya ${rules.firstWordMinLength} huruf.`,
      });
    }
  }

  const wordAt = (x: number, y: number, o: Orientation, isMain: boolean): FormedWord => {
    const cells: FormedWordCell[] = [];
    const push = (cx: number, cy: number) => {
      const k = idx(size, cx, cy);
      const np = newAt.get(k);
      if (np) {
        cells.push({ x: cx, y: cy, letter: np.letter, value: np.value, isNew: true, isBlank: np.isBlank, bonus: bonusAt(layout, cx, cy) });
      } else {
        const c = board[k]!;
        cells.push({ x: cx, y: cy, letter: c.letter, value: c.value, isNew: false, isBlank: c.isBlank });
      }
    };
    if (o === 'H') {
      let sx = x;
      while (has(sx + 1, y)) sx++; // walk to the RIGHTMOST letter = word start
      for (let cx = sx; has(cx, y); cx--) push(cx, y); // read right → left
    } else {
      let sy = y;
      while (has(x, sy - 1)) sy--; // walk to the TOPMOST letter = word start
      for (let cy = sy; has(x, cy); cy++) push(x, cy); // read top → bottom
    }
    const word: FormedWord = { text: cells.map((c) => c.letter).join(''), orientation: o, cells, score: 0, isMain };
    word.score = scoreWord(word);
    return word;
  };

  const words: FormedWord[] = [];
  let main: FormedWord;
  if (orientation) {
    main = wordAt(first.x, first.y, orientation, true);
    words.push(main);
    const perp: Orientation = orientation === 'H' ? 'V' : 'H';
    for (const p of placements) {
      const w = wordAt(p.x, p.y, perp, false);
      if (w.cells.length >= 2) words.push(w);
    }
  } else {
    // Single tile: main direction is whichever forms a word (horizontal first).
    const h = wordAt(first.x, first.y, 'H', false);
    const v = wordAt(first.x, first.y, 'V', false);
    if (h.cells.length < 2 && v.cells.length < 2) {
      if (firstMove) {
        return fail({ code: 'FIRST_MOVE_TOO_SHORT', message: `Perkataan pertama mesti sekurang-kurangnya ${rules.firstWordMinLength} huruf.` });
      }
      return fail({ code: 'NOT_CONNECTED', message: 'Jubin perlu bersambung dengan perkataan di papan.', cells: [{ x: first.x, y: first.y }] });
    }
    if (h.cells.length >= 2) {
      h.isMain = true;
      main = h;
      orientation = 'H';
      words.push(h);
      if (v.cells.length >= 2) words.push(v);
    } else {
      v.isMain = true;
      main = v;
      orientation = 'V';
      words.push(v);
    }
  }

  if (main.cells.length < 2) {
    return fail({ code: 'NO_WORD', message: 'Perkataan mesti sekurang-kurangnya 2 huruf.' });
  }

  if (!firstMove && !words.some((w) => w.cells.some((c) => !c.isNew))) {
    return fail({
      code: 'NOT_CONNECTED',
      message: 'Jubin perlu bersambung dengan perkataan di papan.',
      cells: placements.map(({ x, y }) => ({ x, y })),
    });
  }

  return { ok: true, orientation, words, main, firstMove };
}
