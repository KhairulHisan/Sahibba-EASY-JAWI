/**
 * Regenerate src/data/tile-distribution.json from the approved lexicon.
 *   npm run tiles:derive
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deriveDistribution } from '../src/engine/tiles.ts';
import type { LexiconFile } from '../src/engine/dictionary.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const lexicon = JSON.parse(readFileSync(root + 'src/data/jawi-lexicon.json', 'utf8')) as LexiconFile;
const words = lexicon.entries.filter((e) => e.approved).map((e) => e.jawi);
const dist = deriveDistribution(words);
writeFileSync(root + 'src/data/tile-distribution.json', JSON.stringify(dist, null, 1) + '\n');
console.log(dist.meta);
console.table(dist.tiles.map((t) => ({ huruf: t.letter, bil: t.count, nilai: t.value })));
