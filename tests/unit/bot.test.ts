import { describe, expect, it } from 'vitest';
import { TILE_DISTRIBUTION, coreLexicon } from '../../src/data';
import { chooseBotMove, generateMoves, suggestMove } from '../../src/engine/bot';
import { applyAction, createGame, evaluatePlay } from '../../src/engine/game';
import { Rng } from '../../src/engine/rng';
import type { Difficulty, GameAction, GameState } from '../../src/engine/types';
import { lexiconOf, makeState, tile } from './helpers';

const lexicon = coreLexicon();

interface SimStats {
  state: GameState;
  plays: number;
  swaps: number;
  passes: number;
  wordsPlayed: string[];
}

/** Simulate a full game where every seat is a bot. Asserts legality on every move. */
function simulate(levels: Difficulty[], seed: number): SimStats {
  let state = createGame({
    id: `sim-${seed}`,
    players: levels.map((l, i) => ({ id: `bot${i}`, name: `Bot ${i}`, kind: 'bot' as const, botLevel: l })),
    difficulty: levels[0]!,
    distribution: TILE_DISTRIBUTION,
    seed,
    now: 0,
  });
  const rng = new Rng(seed ^ 0x9e3779b9);
  const stats: SimStats = { state, plays: 0, swaps: 0, passes: 0, wordsPlayed: [] };
  let guard = 0;
  while (state.phase === 'active' && guard++ < 500) {
    const idx = state.currentPlayer;
    const player = state.players[idx]!;
    const decision = chooseBotMove(state, idx, lexicon, player.botLevel!, rng);
    let action: GameAction;
    const base = { id: `${seed}-${guard}`, playerId: player.id, expectedVersion: state.version };
    if (decision.type === 'PLAY') {
      // Independent re-validation with the human validator.
      const ev = evaluatePlay(state, idx, decision.placements, lexicon);
      expect(ev.ok).toBe(true);
      if (ev.ok) for (const w of ev.words) expect(lexicon.has(w.text), w.text).toBe(true);
      action = { ...base, type: 'PLAY', placements: decision.placements };
      stats.plays++;
    } else if (decision.type === 'SWAP') {
      action = { ...base, type: 'SWAP', tileIds: decision.tileIds };
      stats.swaps++;
    } else {
      action = { ...base, type: 'PASS' };
      stats.passes++;
    }
    const res = applyAction(state, action, lexicon);
    if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
    if (res.event.kind === 'play') stats.wordsPlayed.push(...res.event.words.map((w) => w.text));
    state = res.state;
  }
  stats.state = state;
  return stats;
}

describe('move generation', () => {
  it('finds a legal opening that crosses the centre', () => {
    const lex = lexiconOf(['بوکو', 'buku'], ['بس', 'bas']);
    const s = makeState([[tile('ب'), tile('و'), tile('ک'), tile('و'), tile('س')], [tile('ا')]]);
    const moves = generateMoves(s, 0, lex);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      expect(m.placements.some((p) => p.x === 6 && p.y === 6)).toBe(true);
      expect(['بوکو', 'بس']).toContain(m.mainWord);
    }
    // بوکو horizontally: 4 start positions crossing x=6 + 4 vertical = 8; بس: 2 + 2 = 4
    expect(moves.filter((m) => m.mainWord === 'بوکو')).toHaveLength(8);
    expect(moves.filter((m) => m.mainWord === 'بس')).toHaveLength(4);
  });

  it('uses the joker for a missing letter', () => {
    const lex = lexiconOf(['بس', 'bas']);
    const s = makeState([[tile('ب'), { id: 'j1', letter: '', value: 0, isBlank: true }], [tile('ا')]]);
    const moves = generateMoves(s, 0, lex);
    expect(moves.length).toBe(4);
    expect(moves.every((m) => m.usesBlank && m.placements.some((p) => p.letter === 'س'))).toBe(true);
  });

  it('returns nothing when no dictionary word fits, and the bot then swaps or passes', () => {
    const lex = lexiconOf(['بوکو', 'buku']);
    const s = makeState([[tile('ظ'), tile('ظ')], [tile('ا')]]);
    expect(generateMoves(s, 0, lex)).toHaveLength(0);
    const d = chooseBotMove(s, 0, lex, 'sukar', new Rng(1));
    expect(['SWAP', 'PASS']).toContain(d.type);
  });

  it('hint suggests a legal move for the human', () => {
    const lex = lexiconOf(['بوکو', 'buku'], ['بس', 'bas']);
    const s = makeState([[tile('ب', 3), tile('و'), tile('ک', 3), tile('و'), tile('س', 3)], [tile('ا')]]);
    const hint = suggestMove(s, 0, lex, 'mudah');
    expect(hint).not.toBeNull();
    expect(evaluatePlay(s, 0, hint!.placements, lex).ok).toBe(true);
  });
});

describe('full bot games with the real starter lexicon', () => {
  const levels: Difficulty[] = ['mudah', 'sederhana', 'sukar'];
  for (const level of levels) {
    it(`${level}: completes a full 2-player game with only legal dictionary words`, () => {
      for (const seed of [11, 202]) {
        const sim = simulate([level, level], seed);
        expect(sim.state.phase).toBe('finished');
        expect(sim.plays).toBeGreaterThan(8);
        expect(sim.state.result!.winners.length).toBeGreaterThan(0);
        for (const w of sim.wordsPlayed) expect(lexicon.has(w)).toBe(true);
        // Tile conservation: board + bag + racks = 88.
        const onBoard = sim.state.board.filter(Boolean).length;
        const inRacks = sim.state.players.reduce((a, p) => a + p.rack.length, 0);
        expect(onBoard + inRacks + sim.state.bag.length).toBe(88);
      }
    });
  }

  it('4-player mixed game finishes and scores are consistent with the move log', () => {
    const sim = simulate(['mudah', 'sederhana', 'sukar', 'sederhana'], 77);
    expect(sim.state.phase).toBe('finished');
    for (const p of sim.state.players) {
      const fromLog = sim.state.moves.filter((m) => m.playerId === p.id).reduce((a, m) => a + m.score, 0);
      expect(p.score).toBe(fromLog - (p.endPenalty ?? 0));
    }
  });

  it('is deterministic for a given seed', () => {
    const a = simulate(['sederhana', 'sukar'], 5);
    const b = simulate(['sederhana', 'sukar'], 5);
    expect(a.state.players.map((p) => p.score)).toEqual(b.state.players.map((p) => p.score));
    expect(a.wordsPlayed).toEqual(b.wordsPlayed);
  });

  it('SUKAR outscores MUDAH over a set of fixed-seed matches', () => {
    let hard = 0;
    let easy = 0;
    for (const seed of [1, 2, 3, 4]) {
      const sim = simulate(seed % 2 ? ['sukar', 'mudah'] : ['mudah', 'sukar'], seed);
      for (const p of sim.state.players) {
        if (p.botLevel === 'sukar') hard += p.score;
        else easy += p.score;
      }
    }
    expect(hard).toBeGreaterThan(easy);
  });
});
