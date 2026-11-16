import { describe, expect, it } from 'vitest';
import { applyAction, createGame, evaluatePlay } from '../../src/engine/game';
import { idx } from '../../src/engine/board';
import type { ActionDraft, GameAction, GameState, Placement, Tile } from '../../src/engine/types';
import { TILE_DISTRIBUTION } from '../../src/data';
import { aid, blank, lexiconOf, makeState, tile } from './helpers';

const lex = lexiconOf(['بوکو', 'buku'], ['باتو', 'batu'], ['بس', 'bas'], ['ڤمباريس', 'pembaris'], ['اد', 'ada'], ['دا', 'da-ujian']);

function rtl(rack: Tile[], word: string, startX: number, y: number): Placement[] {
  const used = new Set<string>();
  return Array.from(word).map((ch, i) => {
    const t = rack.find((r) => r.letter === ch && !used.has(r.id))!;
    used.add(t.id);
    return { tileId: t.id, x: startX - i, y };
  });
}

function act(s: GameState, a: ActionDraft): GameState {
  const res = applyAction(s, { ...a, id: aid(), expectedVersion: s.version } as GameAction, lex);
  if (!res.ok) throw new Error(res.error.code + ': ' + res.error.message);
  return res.state;
}

describe('scoring', () => {
  it('applies letter and word multipliers of newly placed tiles (centre = 2×P)', () => {
    // Row 6: x7 = 2×H, x6 = ★ 2×P, x5 = 2×H, x4 plain.
    const r = [tile('ب', 3), tile('و', 1), tile('ک', 3), tile('و', 1)];
    const s = makeState([r, [tile('ا')]]);
    const ev = evaluatePlay(s, 0, rtl(r, 'بوکو', 7, 6), lex);
    // (3×2 + 1 + 3×2 + 1) × 2 = 28
    expect(ev.ok && ev.score).toBe(28);
  });

  it('does not re-apply bonuses of tiles already on the board', () => {
    const r1 = [tile('ب', 3), tile('و', 1), tile('ک', 3), tile('و', 1)];
    const r2 = [tile('ا', 1), tile('ت', 2), tile('و', 1)];
    let s = makeState([r1, r2]);
    s = act(s, { type: 'PLAY', playerId: 'p1', placements: rtl(r1, 'بوکو', 7, 6) });
    expect(s.players[0]!.score).toBe(28);
    const p2 = s.players[1]!.rack;
    const placements = [
      { tileId: p2.find((t) => t.letter === 'ا')!.id, x: 7, y: 7 },
      { tileId: p2.find((t) => t.letter === 'ت')!.id, x: 7, y: 8 },
      { tileId: p2.find((t) => t.letter === 'و')!.id, x: 7, y: 9 },
    ];
    const ev = evaluatePlay(s, 1, placements, lex);
    // ب on the used 2×H square counts face value only: 3 + 1 + 2 + 1 = 7
    expect(ev.ok && ev.score).toBe(7);
  });

  it('counts every formed word (main + cross-words)', () => {
    // Board: vertical "بس" at x=6 (ب y6, س y7). Then horizontal "اد" at y=8 under it?
    const r1 = [tile('ب', 3), tile('س', 3)];
    const r2 = [tile('ا', 1), tile('د', 4)];
    let s = makeState([r1, r2]);
    s = act(s, { type: 'PLAY', playerId: 'p1', placements: [{ tileId: r1[0]!.id, x: 6, y: 6 }, { tileId: r1[1]!.id, x: 6, y: 7 }] });
    // p2 plays ا at (7,6) and د at (7,7)? That reads vertical "اد" and makes horizontal cross-words
    // "اب" (x7→x6 on row 6) and "دس" — not words, so rejected:
    const p2 = s.players[1]!.rack;
    const bad = evaluatePlay(s, 1, [{ tileId: p2[0]!.id, x: 7, y: 6 }, { tileId: p2[1]!.id, x: 7, y: 7 }], lex);
    expect(!bad.ok && bad.error.code).toBe('UNKNOWN_WORD');
    expect(!bad.ok && bad.error.words).toEqual(['اب', 'دس']);
  });

  it('scores a single tile that extends an existing letter on a bonus square', () => {
    const r1 = [tile('ا', 1), tile('د', 4)];
    const r2 = [tile('د', 4), tile('ا', 1)];
    let s = makeState([r1, r2]);
    s = act(s, { type: 'PLAY', playerId: 'p1', placements: rtl(r1, 'اد', 7, 6) }); // ا@7 د@6
    // p2 puts ا at (6,7) under د → vertical "دا" (د@6,6 then ا@6,7) = 4 + 1×2(L2 at x6,y7) = 6
    const a = s.players[1]!.rack.find((t) => t.letter === 'ا')!;
    const ev = evaluatePlay(s, 1, [{ tileId: a.id, x: 6, y: 7 }], lex);
    expect(ev.ok && ev.words.map((w) => w.text)).toEqual(['دا']);
    expect(ev.ok && ev.score).toBe(6);
  });

  it('joker is worth 0 but still triggers word multipliers', () => {
    const j = blank();
    const r = [j, tile('س', 3)];
    const s = makeState([r, [tile('ا')]]);
    const ev = evaluatePlay(s, 0, [{ tileId: j.id, x: 7, y: 6, letter: 'ب' }, { tileId: r[1]!.id, x: 6, y: 6 }], lex);
    // ب(joker 0 on 2×H) + س 3 on ★ → (0 + 3) × 2 = 6
    expect(ev.ok && ev.score).toBe(6);
    expect(ev.ok && ev.words[0]!.cells[0]!.isBlank).toBe(true);
  });

  it('adds the all-7-tiles bonus (configurable, default 40)', () => {
    const r = Array.from('ڤمباريس').map((ch) => tile(ch, 1));
    const s = makeState([r, [tile('ا')]]);
    const ev = evaluatePlay(s, 0, rtl(r, 'ڤمباريس', 9, 6), lex);
    // x9..x3 on row 6: 1+1+2+1+2+1+1 = 9, ×2 (centre) = 18, + 40
    expect(ev.ok && ev.score).toBe(58);
    expect(ev.ok && ev.allTilesBonus).toBe(40);
    const s2 = makeState([r, [tile('ا')]], { rules: { allTilesBonus: 25 } });
    const ev2 = evaluatePlay(s2, 0, rtl(r, 'ڤمباريس', 9, 6), lex);
    expect(ev2.ok && ev2.score).toBe(43);
  });
});

describe('game lifecycle', () => {
  it('deals 7 tiles each from a deterministic, seeded bag', () => {
    const mk = (seed: number) =>
      createGame({
        id: 'g',
        players: [
          { id: 'a', name: 'A', kind: 'human' },
          { id: 'b', name: 'B', kind: 'bot', botLevel: 'mudah' },
        ],
        difficulty: 'mudah',
        distribution: TILE_DISTRIBUTION,
        seed,
        now: 0,
      });
    const g1 = mk(7);
    const g2 = mk(7);
    const g3 = mk(8);
    expect(g1.players.every((p) => p.rack.length === 7)).toBe(true);
    expect(g1.bag.length).toBe(88 - 14);
    expect(g1.bag.map((t) => t.id)).toEqual(g2.bag.map((t) => t.id));
    expect(g1.bag.map((t) => t.id)).not.toEqual(g3.bag.map((t) => t.id));
    const all = [...g1.bag, ...g1.players.flatMap((p) => p.rack)];
    expect(new Set(all.map((t) => t.id)).size).toBe(88);
    expect(all.filter((t) => t.isBlank)).toHaveLength(2);
  });

  it('refills the rack after a play and passes the turn', () => {
    const r1 = [tile('ب', 3), tile('س', 3), tile('ا')];
    const bag = [tile('ي'), tile('ن'), tile('م')];
    let s = makeState([r1, [tile('ا')]], { bag });
    s = act(s, { type: 'PLAY', playerId: 'p1', placements: [{ tileId: r1[0]!.id, x: 7, y: 6 }, { tileId: r1[1]!.id, x: 6, y: 6 }] });
    expect(s.players[0]!.rack).toHaveLength(4); // 1 kept + all 3 left in the bag
    expect(s.bag).toHaveLength(0);
    expect(s.phase).toBe('active');
    expect(s.currentPlayer).toBe(1);
    expect(s.turn).toBe(2);
    expect(s.moves[0]).toMatchObject({ type: 'play', playerId: 'p1', words: [{ text: 'بس' }] });
  });

  it('swap needs enough tiles in the bag and consumes the turn', () => {
    const r1 = [tile('ظ', 10), tile('ب')];
    const small = makeState([r1, [tile('ا')]], { bag: [tile('ا'), tile('ي')] });
    const low = applyAction(small, { type: 'SWAP', id: aid(), playerId: 'p1', expectedVersion: 0, tileIds: [r1[0]!.id] }, lex);
    expect(!low.ok && low.error.code).toBe('SWAP_BAG_LOW');

    const bag = Array.from({ length: 10 }, () => tile('ا'));
    let s = makeState([r1, [tile('ا')]], { bag });
    s = act(s, { type: 'SWAP', playerId: 'p1', tileIds: [r1[0]!.id] });
    expect(s.players[0]!.rack.some((t) => t.id === r1[0]!.id)).toBe(false);
    expect(s.players[0]!.rack).toHaveLength(2);
    expect(s.bag).toHaveLength(10);
    expect(s.bag.some((t) => t.id === r1[0]!.id)).toBe(true);
    expect(s.currentPlayer).toBe(1);
    expect(s.consecutiveScoreless).toBe(1);
  });

  it('ends after the scoreless-turn limit and deducts leftovers once', () => {
    let s = makeState([[tile('ب', 3), tile('س', 3)], [tile('ا', 1)]]);
    for (let i = 0; i < 5; i++) s = act(s, { type: 'PASS', playerId: s.players[s.currentPlayer]!.id });
    expect(s.phase).toBe('active');
    s = act(s, { type: 'PASS', playerId: s.players[s.currentPlayer]!.id }); // 3 rounds × 2 players
    expect(s.phase).toBe('finished');
    expect(s.result?.reason).toBe('scoreless');
    expect(s.players[0]!.score).toBe(-6);
    expect(s.players[1]!.score).toBe(-1);
    expect(s.result?.winners).toEqual(['p2']);
    const again = applyAction(s, { type: 'PASS', id: aid(), playerId: 'p1', expectedVersion: s.version }, lex);
    expect(!again.ok && again.error.code).toBe('GAME_FINISHED');
    expect(s.players[0]!.score).toBe(-6);
  });

  it('ends when the bag is empty and a player uses their last tile', () => {
    const r1 = [tile('ب', 3), tile('س', 3)];
    const r2 = [tile('ا', 1), tile('ت', 2)];
    let s = makeState([r1, r2], { bag: [] });
    s = act(s, { type: 'PLAY', playerId: 'p1', placements: [{ tileId: r1[0]!.id, x: 7, y: 6 }, { tileId: r1[1]!.id, x: 6, y: 6 }] });
    expect(s.phase).toBe('finished');
    expect(s.result?.reason).toBe('rack-out');
    // (3×2 + 3) × 2 = 18 for p1; p2 loses leftover 1 + 2
    expect(s.players[0]!.score).toBe(18);
    expect(s.players[1]!.score).toBe(-3);
    expect(s.result?.finalScores.find((f) => f.playerId === 'p2')?.penalty).toBe(3);
    expect(s.result?.winners).toEqual(['p1']);
    expect(s.result?.isTie).toBe(false);
  });

  it('declares joint winners on a tie', () => {
    let s = makeState([[tile('ب', 2)], [tile('س', 2)]]);
    for (let i = 0; i < 6; i++) s = act(s, { type: 'PASS', playerId: s.players[s.currentPlayer]!.id });
    expect(s.result?.isTie).toBe(true);
    expect(s.result?.winners).toEqual(['p1', 'p2']);
  });

  it('resign: 2 players → opponent wins; 3 players → game continues without them', () => {
    let two = makeState([[tile('ب')], [tile('س')]]);
    two = act(two, { type: 'RESIGN', playerId: 'p1' });
    expect(two.phase).toBe('finished');
    expect(two.result).toMatchObject({ reason: 'resign', winners: ['p2'] });
    // No leftover deduction on a resignation win.
    expect(two.players[1]!.score).toBe(0);
    expect(two.result?.finalScores.every((f) => f.penalty === 0)).toBe(true);

    let three = makeState([[tile('ب')], [tile('س')], [tile('ا')]]);
    const bagBefore = three.bag.length;
    three = act(three, { type: 'RESIGN', playerId: 'p2' }); // out of turn is allowed
    expect(three.phase).toBe('active');
    expect(three.currentPlayer).toBe(0);
    expect(three.bag.length).toBe(bagBefore + 1);
    three = act(three, { type: 'PASS', playerId: 'p1' });
    expect(three.currentPlayer).toBe(2); // skips resigned p2
    const blocked = applyAction(three, { type: 'PASS', id: aid(), playerId: 'p2', expectedVersion: three.version }, lex);
    expect(!blocked.ok && blocked.error.code).toBe('NOT_YOUR_TURN');
    // Scoreless limit now counts 2 active players: 3 rounds × 2 = 6 turns.
    for (const id of ['p3', 'p1', 'p3', 'p1']) three = act(three, { type: 'PASS', playerId: id });
    expect(three.phase).toBe('active');
    three = act(three, { type: 'PASS', playerId: 'p3' });
    expect(three.phase).toBe('finished');
    expect(three.result?.winners).not.toContain('p2');
  });

  it('board cells record which move placed them', () => {
    const r1 = [tile('ب', 3), tile('س', 3)];
    let s = makeState([r1, [tile('ا')]]);
    s = act(s, { type: 'PLAY', playerId: 'p1', placements: [{ tileId: r1[0]!.id, x: 7, y: 6 }, { tileId: r1[1]!.id, x: 6, y: 6 }] });
    expect(s.board[idx(13, 6, 6)]).toMatchObject({ letter: 'س', moveIndex: 0 });
  });
});
