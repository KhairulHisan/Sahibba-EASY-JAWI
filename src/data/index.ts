import lexiconJson from './jawi-lexicon.json';
import distributionJson from './tile-distribution.json';
import { Lexicon, type LexiconFile } from '../engine/dictionary';
import type { TileDistribution } from '../engine/tiles';

export const LEXICON_FILE = lexiconJson as unknown as LexiconFile;
export const TILE_DISTRIBUTION = distributionJson as unknown as TileDistribution;

let cached: Lexicon | null = null;
/** Shipped starter lexicon (approved entries only). */
export function coreLexicon(): Lexicon {
  cached ??= new Lexicon(LEXICON_FILE.entries);
  return cached;
}
