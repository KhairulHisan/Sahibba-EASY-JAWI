/**
 * Validate the shipped lexicon (or any CSV/JSON word pack) with the same
 * pipeline the in-app teacher import uses.
 *
 *   npm run lexicon:validate                     # checks src/data/jawi-lexicon.json
 *   npm run lexicon:validate -- path/to/pack.csv # checks a teacher pack
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Lexicon, csvToRawEntries, jsonToRawEntries, validateImport, type LexiconFile } from '../src/engine/dictionary.ts';
import { inspectJawi, isPlayableWord } from '../src/engine/jawi.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const target = process.argv[2];

if (target) {
  const text = readFileSync(target, 'utf8');
  const raw = target.endsWith('.csv') ? csvToRawEntries(text) : jsonToRawEntries(text);
  const core = new Lexicon((JSON.parse(readFileSync(root + 'src/data/jawi-lexicon.json', 'utf8')) as LexiconFile).entries);
  const report = validateImport(raw, { pack: 'semakan', existing: core });
  for (const i of report.issues) console.log(`${i.level === 'error' ? '✗' : '!'} baris ${i.row}: ${i.message}`);
  console.log(`\n${report.accepted.length}/${report.totalRows} entri diterima.`);
  process.exit(report.issues.some((i) => i.level === 'error') ? 1 : 0);
}

const file = JSON.parse(readFileSync(root + 'src/data/jawi-lexicon.json', 'utf8')) as LexiconFile;
let errors = 0;
const seen = new Set<string>();
for (const e of file.entries) {
  const r = inspectJawi(e.jawi);
  const problems: string[] = [];
  if (r.changed) problems.push(`tidak kanonik (sepatutnya ${r.normalized})`);
  if (r.unknownLetters.length) problems.push(`huruf luar set jubin: ${r.unknownLetters.join(' ')}`);
  if (!isPlayableWord(r.normalized)) problems.push('tidak boleh dimainkan');
  if (!e.meaningMs?.trim()) problems.push('tiada makna');
  if (seen.has(e.jawi + '|' + e.rumi)) problems.push('pendua');
  seen.add(e.jawi + '|' + e.rumi);
  if (problems.length) {
    errors++;
    console.log(`✗ ${e.id} ${e.rumi} ${e.jawi}: ${problems.join('; ')}`);
  }
}
console.log(`${file.meta.name} v${file.meta.version} — ${file.entries.length} entri, status: ${file.meta.reviewStatusMs}`);
console.log(errors ? `${errors} entri bermasalah.` : 'Semua entri sah dari segi teknikal (ejaan masih perlu disemak guru).');
process.exit(errors ? 1 : 0);
