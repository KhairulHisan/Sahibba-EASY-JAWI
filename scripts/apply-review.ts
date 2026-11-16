/**
 * Apply a filled-in review worksheet (see docs/semakan/ARAHAN-SEMAKAN.md) to
 * src/data/jawi-lexicon.json.
 *
 *   npm run lexicon:apply-review -- <reviewed.csv> [decisions.json]
 *
 * - SALAH + ejaan_jawi_cadangan → spelling replaced (normalised, must use tile
 *   letters), entry marked review = 'ai-fixed'.
 * - makna_cadangan → meaning replaced.
 * - RAGU → entry kept, marked review = 'ai-doubt' (needs a teacher).
 * - BETUL → marked review = 'ai-ok'.
 * decisions.json may reject or override individual suggestions:
 *   { "rejectSpelling": [id], "rejectMeaning": [id], "meaningOverride": { id: text }, "reviewer": "..." }
 * Run `npm run tiles:derive` afterwards (spellings change letter frequencies).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { csvToRawEntries, type LexiconFile } from '../src/engine/dictionary.ts';
import { inspectJawi, isPlayableWord } from '../src/engine/jawi.ts';

const [csvPath, decisionsPath] = process.argv.slice(2);
if (!csvPath) {
  console.error('Guna: npm run lexicon:apply-review -- <fail-semakan.csv> [keputusan.json]');
  process.exit(2);
}
interface Decisions {
  rejectSpelling?: string[];
  rejectMeaning?: string[];
  meaningOverride?: Record<string, string>;
  reviewer?: string;
}
const decisions: Decisions = decisionsPath ? JSON.parse(readFileSync(decisionsPath, 'utf8')) : {};
const root = fileURLToPath(new URL('..', import.meta.url));
const lexPath = root + 'src/data/jawi-lexicon.json';
const lex = JSON.parse(readFileSync(lexPath, 'utf8')) as LexiconFile;
const byId = new Map(lex.entries.map((e) => [e.id, e]));
const rows = csvToRawEntries(readFileSync(csvPath, 'utf8')) as unknown as Record<string, string>[];

const log: string[] = [];
const counts = { ok: 0, fixed: 0, doubt: 0, meaning: 0, rejected: 0, skipped: 0 };
for (const row of rows) {
  const e = byId.get((row.id ?? '').trim());
  if (!e) {
    counts.skipped++;
    log.push(`! id tidak dikenali: ${row.id} (${row.rumi})`);
    continue;
  }
  if ((row.rumi ?? '').trim() !== e.rumi || inspectJawi(row.jawi ?? '').normalized !== e.jawi) {
    counts.skipped++;
    log.push(`! ${e.id} ${e.rumi}: lajur rumi/jawi berbeza daripada kamus — baris diabaikan.`);
    continue;
  }
  const status = (row.status_semakan ?? '').trim().toUpperCase();
  const suggestion = (row.ejaan_jawi_cadangan ?? '').trim();
  if (status === 'SALAH' && suggestion) {
    const rep = inspectJawi(suggestion);
    if (decisions.rejectSpelling?.includes(e.id)) {
      counts.rejected++;
      e.review = 'ai-doubt';
      log.push(`× ${e.rumi}: cadangan ${rep.normalized} DITOLAK — kekal ${e.jawi}, perlu guru.`);
    } else if (rep.unknownLetters.length || !isPlayableWord(rep.normalized)) {
      counts.rejected++;
      e.review = 'ai-doubt';
      log.push(`× ${e.rumi}: cadangan ${suggestion} ada huruf luar set jubin (${rep.unknownLetters.join(' ')}) — tidak digunakan.`);
    } else {
      log.push(`✓ ${e.rumi}: ${e.jawi} → ${rep.normalized}`);
      e.jawi = rep.normalized;
      e.review = 'ai-fixed';
      counts.fixed++;
    }
  } else if (status === 'RAGU' || status === 'SALAH') {
    e.review = 'ai-doubt';
    counts.doubt++;
  } else if (status === 'BETUL') {
    e.review = 'ai-ok';
    counts.ok++;
  }
  const meaning = decisions.meaningOverride?.[e.id] ?? (row.makna_cadangan ?? '').trim();
  if (meaning && meaning !== e.meaningMs) {
    if (decisions.rejectMeaning?.includes(e.id)) {
      counts.rejected++;
      log.push(`× ${e.rumi}: makna cadangan ditolak — kekal "${e.meaningMs}"`);
    } else {
      log.push(`~ ${e.rumi}: makna "${e.meaningMs}" → "${meaning}"`);
      e.meaningMs = meaning;
      counts.meaning++;
    }
  }
}

writeFileSync(lexPath, JSON.stringify(lex, null, 1) + '\n');
console.log(log.join('\n'));
console.log(
  `\n${rows.length} baris: ${counts.ok} BETUL, ${counts.fixed} ejaan dibetulkan, ${counts.doubt} perlu guru, ` +
    `${counts.meaning} makna dikemas kini, ${counts.rejected} cadangan ditolak, ${counts.skipped} baris diabaikan.`,
);
console.log('Seterusnya: npm run tiles:derive && npm test');
