import { createGame, type CreateGameOptions } from '../../src/engine/game';
import { Lexicon, type LexiconEntry } from '../../src/engine/dictionary';
import type { GameState, Tile } from '../../src/engine/types';
import { TILE_DISTRIBUTION } from '../../src/data';
import { normalizeJawi } from '../../src/engine/jawi';

let tileSeq = 0;

/** Make a rack tile. Values default to 1 unless given. */
export function tile(letter: string, value = 1): Tile {
  return { id: `x${++tileSeq}`, letter, value, isBlank: false };
}

export function blank(): Tile {
  return { id: `b${++tileSeq}`, letter: '', value: 0, isBlank: true };
}

export function entry(jawi: string, rumi: string, extra: Partial<LexiconEntry> = {}): LexiconEntry {
  return {
    id: rumi,
    jawi: normalizeJawi(jawi),
    rumi,
    meaningMs: `makna ${rumi}`,
    category: 'umum',
    difficulty: 1,
    approved: true,
    sourceNote: 'ujian',
    ...extra,
  };
}

export function lexiconOf(...words: [string, string][]): Lexicon {
  return new Lexicon(words.map(([j, r]) => entry(j, r)));
}

/** Two-player game with custom racks (and optionally a custom bag). */
export function makeState(racks: Tile[][], opts: Partial<CreateGameOptions> & { bag?: Tile[] } = {}): GameState {
  const s = createGame({
    id: 'g-test',
    players: racks.map((_, i) => ({ id: `p${i + 1}`, name: `Pemain ${i + 1}`, kind: 'human' as const })),
    difficulty: 'sederhana',
    distribution: TILE_DISTRIBUTION,
    seed: 42,
    now: 0,
    ...opts,
  });
  racks.forEach((rack, i) => (s.players[i]!.rack = rack));
  if (opts.bag) s.bag = opts.bag;
  return s;
}

let actionSeq = 0;
export const aid = () => `a${++actionSeq}`;
