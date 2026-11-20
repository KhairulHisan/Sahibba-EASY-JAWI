import { describe, expect, it } from 'vitest';
import { applyAction, evaluatePlay } from '../../src/engine/game';
import { getLayout, idx, countBonuses, bonusAt } from '../../src/engine/board';
import type { GameState, Placement, Tile } from '../../src/engine/types';
import { aid, blank, lexiconOf, makeState, tile } from './helpers';

const lex = lexiconOf(
  ['بوکو', 'buku'],
  ['باتو', 'batu'],
  ['بس', 'bas'],
  ['ايبو', 'ibu'],
  ['سوسو', 'susu'],
  ['اد', 'ada'],
  ['ڤمباريس', 'pembaris'],
);
const layout = getLayout('wau-13');

/** Place word letters right→left starting at x=startX on row y. */
function horizontal(rack: Tile[], word: string, startX: number, y: number): Placement[] {
  return Array.from(word).map((ch, i) => {
    const t = rack.find((r) => r.letter === ch && !usedIds.has(r.id))!;
    usedIds.add(t.id);
    return { tileId: t.id, x: startX - i, y };
  });
}
function vertical(rack: Tile[], word: string, x: number, startY: number): Placement[] {
  return Array.from(word).map((ch, i) => {
    const t = rack.find((r) => r.letter === ch && !usedIds.has(r.id))!;
    usedIds.add(t.id);
    return { tileId: t.id, x, y: startY + i };
  });
}
const usedIds = new Set<string>();

function play(s: GameState, playerId: string, placements: Placement[]) {
  return applyAction(s, { type: 'PLAY', id: aid(), playerId, expectedVersion: s.version, placements }, lex);
}

describe('board layout', () => {
  it('is an original symmetric 13×13 map with centre start and labelled bonuses', () => {
    expect(layout.size).toBe(13);
    expect(layout.center).toEqual({ x: 6, y: 6 });
    expect(bonusAt(layout, 6, 6)).toBe('W2');
    const c = countBonuses(layout);
    expect(c.L2 + c.L3 + c.W2 + c.W3).toBe(45);
    for (let y = 0; y < 13; y++)
      for (let x = 0; x < 13; x++) {
        const b = bonusAt(layout, x, y);
        expect(bonusAt(layout, 12 - x, y)).toBe(b);
        expect(bonusAt(layout, x, 12 - y)).toBe(b);
        expect(bonusAt(layout, y, x)).toBe(b);
      }
  });
});

describe('Jawi orientation: horizontal RIGHT→LEFT, vertical TOP→BOTTOM', () => {
  it('reads a horizontal word from the rightmost tile leftwards', () => {
    const rack = [tile('ب'), tile('و'), tile('ک'), tile('و'), tile('ا'), tile('ت'), tile('س')];
    const s = makeState([rack, [tile('ا')]]);
    usedIds.clear();
    const ev = evaluatePlay(s, 0, horizontal(rack, 'بوکو', 7, 6), lex);
    expect(ev.ok).toBe(true);
    if (ev.ok) {
      expect(ev.words[0]!.text).toBe('بوکو');
      expect(ev.words[0]!.cells.map((c) => c.x)).toEqual([7, 6, 5, 4]);
      expect(ev.words[0]!.orientation).toBe('H');
    }
  });

  it('rejects the same letters laid out left→right (would read وکوب)', () => {
    const rack = [tile('ب'), tile('و'), tile('ک'), tile('و')];
    const s = makeState([rack, [tile('ا')]]);
    const ltr: Placement[] = rack.map((t, i) => ({ tileId: t.id, x: 4 + i, y: 6 }));
    const ev = evaluatePlay(s, 0, ltr, lex);
    expect(ev.ok).toBe(false);
    if (!ev.ok) {
      expect(ev.error.code).toBe('UNKNOWN_WORD');
      expect(ev.error.words).toEqual(['وکوب']);
    }
  });

  it('reads a vertical word top→bottom', () => {
    const rack = [tile('ب'), tile('و'), tile('ک'), tile('و')];
    const s = makeState([rack, [tile('ا')]]);
    usedIds.clear();
    const ev = evaluatePlay(s, 0, vertical(rack, 'بوکو', 6, 4), lex);
    expect(ev.ok && ev.words[0]!.text).toBe('بوکو');
    expect(ev.ok && ev.words[0]!.orientation).toBe('V');
  });

  it('includes existing tiles and builds cross-words in reading order', () => {
    const r1 = [tile('ب'), tile('و'), tile('ک'), tile('و'), tile('ا'), tile('ت'), tile('س')];
    const r2 = [tile('ا'), tile('ت'), tile('و'), tile('س'), tile('ي'), tile('د'), tile('م')];
    let s = makeState([r1, r2]);
    usedIds.clear();
    const first = play(s, 'p1', horizontal(r1, 'بوکو', 7, 6));
    expect(first.ok).toBe(true);
    s = (first as { state: GameState }).state;
    // p2 extends the existing ب at (7,6) downwards: باتو
    const p2 = s.players[1]!.rack;
    const placements: Placement[] = [
      { tileId: p2.find((t) => t.letter === 'ا')!.id, x: 7, y: 7 },
      { tileId: p2.find((t) => t.letter === 'ت')!.id, x: 7, y: 8 },
      { tileId: p2.find((t) => t.letter === 'و')!.id, x: 7, y: 9 },
    ];
    const ev = evaluatePlay(s, 1, placements, lex);
    expect(ev.ok).toBe(true);
    if (ev.ok) {
      expect(ev.words.map((w) => w.text)).toEqual(['باتو']);
      expect(ev.words[0]!.cells[0]).toMatchObject({ x: 7, y: 6, isNew: false });
    }
  });

  it('forms a horizontal cross-word reading right→left when one tile is added', () => {
    const r1 = [tile('ب'), tile('و'), tile('ک'), tile('و')];
    const r2 = [tile('س'), tile('ا')];
    let s = makeState([r1, r2]);
    usedIds.clear();
    // vertical بوکو at x=6, y=6..9 — ب on the centre.
    s = (play(s, 'p1', vertical(r1, 'بوکو', 6, 6)) as { state: GameState }).state;
    // Put س LEFT of ب (x=5,y=6): reading right→left gives بس.
    const sTile = s.players[1]!.rack.find((t) => t.letter === 'س')!;
    const ev = evaluatePlay(s, 1, [{ tileId: sTile.id, x: 5, y: 6 }], lex);
    expect(ev.ok && ev.words.map((w) => w.text)).toEqual(['بس']);
    // Putting it on the RIGHT reads سب → not a word.
    const bad = evaluatePlay(s, 1, [{ tileId: sTile.id, x: 7, y: 6 }], lex);
    expect(!bad.ok && bad.error.code).toBe('UNKNOWN_WORD');
  });
});

describe('placement rejections with explanations', () => {
  const rack = () => [tile('ب'), tile('و'), tile('ک'), tile('و'), tile('ا'), tile('ت'), tile('س')];

  it('off-board', () => {
    const r = rack();
    const s = makeState([r, [tile('ا')]]);
    const ev = evaluatePlay(s, 0, [{ tileId: r[0]!.id, x: 13, y: 6 }], lex);
    expect(!ev.ok && ev.error.code).toBe('OFF_BOARD');
  });

  it('non-collinear tiles', () => {
    const r = rack();
    const s = makeState([r, [tile('ا')]]);
    const ev = evaluatePlay(s, 0, [{ tileId: r[0]!.id, x: 6, y: 6 }, { tileId: r[1]!.id, x: 5, y: 7 }], lex);
    expect(!ev.ok && ev.error.code).toBe('NOT_COLLINEAR');
    expect(!ev.ok && ev.error.message).toMatch(/satu baris/);
  });

  it('gaps between tiles', () => {
    const r = rack();
    const s = makeState([r, [tile('ا')]]);
    const ev = evaluatePlay(s, 0, [{ tileId: r[0]!.id, x: 7, y: 6 }, { tileId: r[1]!.id, x: 5, y: 6 }], lex);
    expect(!ev.ok && ev.error.code).toBe('GAP');
    expect(!ev.ok && ev.error.cells).toEqual([{ x: 6, y: 6 }]);
  });

  it('first move must cross the centre', () => {
    const r = rack();
    const s = makeState([r, [tile('ا')]]);
    usedIds.clear();
    const ev = evaluatePlay(s, 0, horizontal(r, 'بس', 3, 2), lex);
    expect(!ev.ok && ev.error.code).toBe('FIRST_MOVE_CENTER');
  });

  it('first move must have at least 2 letters', () => {
    const r = rack();
    const s = makeState([r, [tile('ا')]]);
    const ev = evaluatePlay(s, 0, [{ tileId: r[0]!.id, x: 6, y: 6 }], lex);
    expect(!ev.ok && ev.error.code).toBe('FIRST_MOVE_TOO_SHORT');
  });

  it('later moves must connect to existing tiles', () => {
    const r1 = rack();
    const r2 = [tile('ب'), tile('س')];
    let s = makeState([r1, r2]);
    usedIds.clear();
    s = (play(s, 'p1', horizontal(r1, 'بوکو', 7, 6)) as { state: GameState }).state;
    const p2 = s.players[1]!.rack;
    const ev = evaluatePlay(s, 1, [{ tileId: p2[0]!.id, x: 1, y: 1 }, { tileId: p2[1]!.id, x: 0, y: 1 }], lex);
    expect(!ev.ok && ev.error.code).toBe('NOT_CONNECTED');
    expect(!ev.ok && ev.error.message).toBe('Jubin perlu bersambung dengan perkataan di papan.');
  });

  it('occupied cells and duplicate cells', () => {
    const r1 = rack();
    let s = makeState([r1, [tile('س'), tile('ب')]]);
    usedIds.clear();
    s = (play(s, 'p1', horizontal(r1, 'بوکو', 7, 6)) as { state: GameState }).state;
    const p2 = s.players[1]!.rack;
    const occ = evaluatePlay(s, 1, [{ tileId: p2[0]!.id, x: 7, y: 6 }], lex);
    expect(!occ.ok && occ.error.code).toBe('OCCUPIED');
    const dup = evaluatePlay(s, 1, [{ tileId: p2[0]!.id, x: 8, y: 6 }, { tileId: p2[1]!.id, x: 8, y: 6 }], lex);
    expect(!dup.ok && dup.error.code).toBe('DUPLICATE_CELL');
  });

  it('tiles not in the rack and jokers without a letter', () => {
    const r = [blank(), tile('س')];
    const s = makeState([r, [tile('ا')]]);
    const notOwned = evaluatePlay(s, 0, [{ tileId: 'nope', x: 6, y: 6 }], lex);
    expect(!notOwned.ok && notOwned.error.code).toBe('TILE_NOT_OWNED');
    const noLetter = evaluatePlay(s, 0, [{ tileId: r[0]!.id, x: 7, y: 6 }, { tileId: r[1]!.id, x: 6, y: 6 }], lex);
    expect(!noLetter.ok && noLetter.error.code).toBe('BLANK_NEEDS_LETTER');
    const badLetter = evaluatePlay(s, 0, [{ tileId: r[0]!.id, x: 7, y: 6, letter: 'Q' }, { tileId: r[1]!.id, x: 6, y: 6 }], lex);
    expect(!badLetter.ok && badLetter.error.code).toBe('INVALID_LETTER');
    const ok = evaluatePlay(s, 0, [{ tileId: r[0]!.id, x: 7, y: 6, letter: 'ب' }, { tileId: r[1]!.id, x: 6, y: 6 }], lex);
    expect(ok.ok && ok.words[0]!.text).toBe('بس');
  });

  it('unknown words are named in the error', () => {
    const r = rack();
    const s = makeState([r, [tile('ا')]]);
    usedIds.clear();
    const ev = evaluatePlay(s, 0, horizontal(r, 'تس', 7, 6), lex);
    expect(!ev.ok && ev.error.code).toBe('UNKNOWN_WORD');
    expect(!ev.ok && ev.error.message).toContain('Ejaan belum ditemui dalam kamus');
    expect(!ev.ok && ev.error.words).toEqual(['تس']);
  });
});

describe('turn, version and idempotency guards', () => {
  it('rejects wrong turn, stale version and duplicate actions', () => {
    const r1 = [tile('ب'), tile('س')];
    const s = makeState([r1, [tile('ا'), tile('د')]]);
    const placements = [{ tileId: r1[0]!.id, x: 7, y: 6 }, { tileId: r1[1]!.id, x: 6, y: 6 }];
    const wrongTurn = applyAction(s, { type: 'PLAY', id: aid(), playerId: 'p2', expectedVersion: 0, placements }, lex);
    expect(!wrongTurn.ok && wrongTurn.error.code).toBe('NOT_YOUR_TURN');

    const stale = applyAction(s, { type: 'PLAY', id: aid(), playerId: 'p1', expectedVersion: 5, placements }, lex);
    expect(!stale.ok && stale.error.code).toBe('STALE_VERSION');

    const id = aid();
    const ok = applyAction(s, { type: 'PLAY', id, playerId: 'p1', expectedVersion: 0, placements }, lex);
    expect(ok.ok).toBe(true);
    const next = (ok as { state: GameState }).state;
    expect(next.version).toBe(1);
    expect(next.board[idx(13, 7, 6)]?.letter).toBe('ب');
    // Retrying the same action (e.g. network retry) cannot score twice.
    const retry = applyAction(next, { type: 'PLAY', id, playerId: 'p1', expectedVersion: 1, placements }, lex);
    expect(!retry.ok && retry.error.code).toBe('DUPLICATE_ACTION');
    expect(next.players[0]!.score).toBe((ok as { state: GameState }).state.players[0]!.score);
    // Original state is untouched (pure function).
    expect(s.version).toBe(0);
    expect(s.board.every((c) => c === null)).toBe(true);
  });
});
