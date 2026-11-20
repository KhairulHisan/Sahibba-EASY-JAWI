import { describe, expect, it } from 'vitest';
import { TILE_DISTRIBUTION, coreLexicon } from '../../src/data';
import { chooseBotMove, suggestMove } from '../../src/engine/bot';
import { createGame } from '../../src/engine/game';
import { Rng } from '../../src/engine/rng';
import { computeBotMove, computeHint } from '../../src/features/single/botClient';

const game = () =>
  createGame({
    id: 'g',
    players: [
      { id: 'anda', name: 'A', kind: 'human' },
      { id: 'bot', name: 'B', kind: 'bot', botLevel: 'sukar' },
    ],
    difficulty: 'sukar',
    distribution: TILE_DISTRIBUTION,
    seed: 3,
    now: 0,
  });

describe('bot client without Web Workers (main-thread fallback)', () => {
  it('returns the same bot decision as the engine for the same seed', async () => {
    expect(typeof Worker).toBe('undefined');
    const g = game();
    const viaClient = await computeBotMove(g, 1, 'sukar', 99, coreLexicon(), 'teras');
    expect(viaClient).toEqual(chooseBotMove(g, 1, coreLexicon(), 'sukar', new Rng(99)));
  });

  it('returns the same hint as the engine', async () => {
    const g = game();
    expect(await computeHint(g, 0, 'mudah', coreLexicon(), 'teras')).toEqual(suggestMove(g, 0, coreLexicon(), 'mudah'));
  });
});
