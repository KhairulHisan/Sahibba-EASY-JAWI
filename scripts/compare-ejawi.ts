/**
 * Compare EASY JAWI spellings with the output of an external Rumi→Jawi
 * converter (e.g. eJawiMakmur by MUIP), word by word.
 *
 *   1. npm run lexicon:export-review            (writes docs/semakan/ejawimakmur/rumi-NN.txt)
 *   2. Paste rumi-NN.txt into the converter, save its Jawi output as a text file.
 *   3. npm run lexicon:compare-ejawi -- NN path/to/output.txt   (NN = 01…07 or "semua")
 *
 * Writes docs/semakan/ejawimakmur/perbandingan-NN.csv and prints the differences.
 * Both sides are normalised first (ك→ک, گ/ڬ→ݢ, ی→ي, harakat removed) so only
 * real spelling differences are reported. Nothing in the lexicon is changed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LexiconFile } from '../src/engine/dictionary.ts';
import { normalizeJawi } from '../src/engine/jawi.ts';

const [part, outputPath] = process.argv.slice(2);
if (!part || !outputPath) {
  console.error('Guna: npm run lexicon:compare-ejawi -- <01..07|semua> <fail-output-jawi.txt>');
  process.exit(2);
}
const root = fileURLToPath(new URL('..', import.meta.url));
const dir = root + 'docs/semakan/ejawimakmur/';
const lex = JSON.parse(readFileSync(root + 'src/data/jawi-lexicon.json', 'utf8')) as LexiconFile;
const byId = new Map(lex.entries.map((e) => [e.id, e]));
const order = JSON.parse(readFileSync(dir + 'urutan.json', 'utf8')) as string[];

const rumi = readFileSync(`${dir}rumi-${part}.txt`, 'utf8').split(/\r?\n/).map((w) => w.trim()).filter(Boolean);
const offset = part === 'semua' ? 0 : (Number(part) - 1) * 200;
const ids = order.slice(offset, offset + rumi.length);

// Converter output: words separated by spaces or new lines; drop punctuation.
const theirs = normalizeJawi(readFileSync(outputPath, 'utf8'))
  .replace(/[،؛؟.,;:!?"'()\[\]«»]/g, ' ')
  .split(/\s+/)
  .filter(Boolean);

if (theirs.length !== rumi.length) {
  console.error(
    `Bilangan perkataan tidak sepadan: ${rumi.length} perkataan Rumi tetapi ${theirs.length} perkataan Jawi dalam output.\n` +
      'Pastikan seluruh senarai ditampal dan output disalin sepenuhnya, satu perkataan Jawi bagi setiap perkataan Rumi.',
  );
  process.exit(1);
}

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const lines = ['bil,id,rumi,jawi_easy_jawi,jawi_ejawimakmur,keputusan'];
const diffs: string[] = [];
let same = 0;
let variant = 0;
ids.forEach((id, i) => {
  const e = byId.get(id);
  if (!e || e.rumi !== rumi[i]) throw new Error(`Urutan tidak sepadan pada baris ${i + 1}; jalankan semula lexicon:export-review.`);
  const ours = normalizeJawi(e.jawi);
  const other = theirs[i]!;
  const verdict = other === ours ? 'SAMA' : (e.variants ?? []).map(normalizeJawi).includes(other) ? 'SAMA (varian)' : 'BERBEZA';
  if (verdict === 'SAMA') same++;
  else if (verdict.startsWith('SAMA')) variant++;
  else diffs.push(`${String(offset + i + 1).padStart(4)}  ${e.rumi.padEnd(14)} EASY JAWI: ${ours}   eJawiMakmur: ${other}`);
  lines.push([String(offset + i + 1), id, e.rumi, ours, other, verdict].map(esc).join(','));
});

const out = `${dir}perbandingan-${part}.csv`;
writeFileSync(out, '﻿' + lines.join('\r\n') + '\r\n');
console.log(`${rumi.length} perkataan: ${same} sama, ${variant} sama (varian), ${diffs.length} berbeza.`);
if (diffs.length) console.log('\nPerkataan berbeza (perlu semakan guru):\n' + diffs.join('\n'));
console.log(`\nLaporan: ${out}`);
