import { BONUS_META } from './board';
import type { FormedWord, GameRules } from './types';

/**
 * Score one formed word. Letter and word multipliers apply ONLY to tiles newly
 * placed this turn (existing tiles never re-trigger their bonus square).
 * Blank tiles are worth 0 but still trigger word multipliers.
 */
export function scoreWord(word: Pick<FormedWord, 'cells'>): number {
  let sum = 0;
  let wordMult = 1;
  for (const c of word.cells) {
    const meta = c.isNew && c.bonus ? BONUS_META[c.bonus] : undefined;
    sum += c.value * (meta?.letterMult ?? 1);
    if (meta) wordMult *= meta.wordMult;
  }
  return sum * wordMult;
}

export interface MoveScore {
  total: number;
  wordsTotal: number;
  allTilesBonus: number;
}

/** Total for a move: every formed word + bonus if the whole rack was used. */
export function scoreMove(words: readonly FormedWord[], tilesPlaced: number, rules: Pick<GameRules, 'rackSize' | 'allTilesBonus'>): MoveScore {
  const wordsTotal = words.reduce((a, w) => a + w.score, 0);
  const allTilesBonus = tilesPlaced === rules.rackSize ? rules.allTilesBonus : 0;
  return { total: wordsTotal + allTilesBonus, wordsTotal, allTilesBonus };
}

export function rackValue(rack: readonly { value: number }[]): number {
  return rack.reduce((a, t) => a + t.value, 0);
}
