/**
 * Export the lexicon as review worksheets (CSV) for a teacher or an AI
 * reviewer, sorted by how likely each spelling is to need correction.
 *
 *   npm run lexicon:export-review
 *
 * Writes docs/semakan/senarai-semakan-kamus.csv (all rows) and
 * docs/semakan/bahagian/bahagian-NN.csv (chunks of 200 rows).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATEGORY_LABELS, type LexiconEntry, type LexiconFile } from '../src/engine/dictionary.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const lex = JSON.parse(readFileSync(root + 'src/data/jawi-lexicon.json', 'utf8')) as LexiconFile;
// Roots that take verbal/adjectival affixes; nouns like "mata" or "rak" are
// excluded so "permata" or "perak" are not mistaken for affixed words.
const AFFIXABLE = new Set(['perbuatan', 'sifat', 'perasaan', 'sekolah', 'sukan', 'nombor']);
const byRumi = new Set(lex.entries.filter((e) => AFFIXABLE.has(e.category)).map((e) => e.rumi));

/** Spellings the compiler was least sure about while writing the list. */
const DOUBTFUL = new Set([
  'rehat', 'bah', 'had', 'kad', 'tuah', 'lap', 'dam', 'pas', 'tan', 'dewasa', 'baring', 'sorak', 'tuang', 'pendek', 'naik',
  'sihat', 'kesihatan', 'rakyat', 'adat', 'salji', 'kek', 'peta', 'muka', 'lama', 'sayang', 'pula', 'bila', 'saat', 'kalam',
  'darjah', 'ustaz', 'taat', 'zakat', 'sultan', 'hadir', 'zohor', 'maghrib', 'cuka', 'luka', 'suka', 'buka', 'dodol', 'cucur',
  'kurma', 'gerhana', 'tembaga', 'sejuta', 'rebana', 'gamelan', 'hikayat', 'tamadun', 'syurga', 'wuduk', 'isyak', 'asar',
]);

const ARABIC_ONLY = /[عحخذصضطظغثشة]/;

/** Words that merely look affixed (lapan = 8, not lap + -an). */
const NOT_AFFIXED = new Set(['lapan']);

function rootOf(r: string): string | null {
  if (NOT_AFFIXED.has(r)) return null;
  const tries: string[] = [];
  if (r.endsWith('an')) tries.push(r.slice(0, -2));
  if (r.startsWith('ke') && r.endsWith('an')) tries.push(r.slice(2, -2));
  const prefixes: [string, string[]][] = [
    ['ber', ['']], ['be', ['']], ['ter', ['']], ['di', ['']],
    ['meng', ['', 'k']], ['meny', ['s']], ['mem', ['', 'p']], ['men', ['', 't']], ['me', ['']],
    ['peng', ['', 'k']], ['peny', ['s']], ['pem', ['', 'p']], ['pen', ['', 't']], ['pel', ['', 'l']], ['per', ['', 'r']], ['pe', ['']],
  ];
  for (const [p, restore] of prefixes) {
    if (!r.startsWith(p) || r.length - p.length < 2) continue;
    for (const c of restore) {
      const base = c + r.slice(p.length);
      tries.push(base, base.endsWith('an') ? base.slice(0, -2) : '');
    }
  }
  return tries.find((t) => t && t !== r && byRumi.has(t)) ?? null;
}

type Level = 'TINGGI' | 'SEDERHANA' | 'RENDAH';
interface Row {
  e: LexiconEntry;
  level: Level;
  reasons: string[];
  root: string | null;
}

const rank: Record<Level, number> = { TINGGI: 0, SEDERHANA: 1, RENDAH: 2 };
const rows: Row[] = lex.entries.map((e) => {
  const reasons: string[] = [];
  let level: Level = 'RENDAH';
  const bump = (l: Level, why: string) => {
    reasons.push(why);
    if (rank[l] < rank[level]) level = l;
  };
  const root = rootOf(e.rumi);
  if (root) bump('TINGGI', `kata berimbuhan (dasar: ${root}) — semak ejaan imbuhan & huruf yang luluh`);
  if (DOUBTFUL.has(e.rumi)) bump('TINGGI', 'penyusun kurang pasti ejaan ini');
  if (ARABIC_ONLY.test(e.jawi)) bump('TINGGI', 'kata pinjaman Arab — semak ejaan asal');
  if (e.jawi.includes('ۏ') || /[vz]/.test(e.rumi)) bump('TINGGI', 'kata pinjaman (v/z) — semak huruf ۏ/ز');
  if (e.jawi.includes('ء')) bump('SEDERHANA', 'menggunakan hamzah ء — semak kedudukan');
  if (/[aeiou]{2}/.test(e.rumi.replace(/ng|ny/g, ''))) bump('SEDERHANA', 'diftong/vokal berganding — semak ا/و/ي/ء');
  if (/a$/.test(e.rumi)) bump('SEDERHANA', "huruf 'a' di akhir — semak sama ada alif ditulis");
  if (/e/.test(e.rumi)) bump('SEDERHANA', "vokal 'e' (pepet/taling) — semak sama ada ي ditulis");
  if (reasons.length === 0) reasons.push('kata dasar mudah');
  return { e, level, reasons, root };
});
rows.sort((a, b) => rank[a.level] - rank[b.level] || a.e.category.localeCompare(b.e.category) || a.e.rumi.localeCompare(b.e.rumi));

const HEADER = [
  'bil', 'id', 'keutamaan', 'sebab_semakan', 'jawi', 'rumi', 'jenis', 'kata_dasar', 'kategori', 'tahap', 'makna',
  'status_semakan', 'ejaan_jawi_cadangan', 'makna_cadangan', 'catatan',
];
const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (list: Row[], offset = 0) =>
  '﻿' +
  [HEADER, ...list.map((r, i) => [
    offset + i + 1, r.e.id, r.level, r.reasons.join('; '), r.e.jawi, r.e.rumi, r.root ? 'berimbuhan' : 'dasar', r.root ?? '',
    CATEGORY_LABELS[r.e.category] ?? r.e.category, r.e.difficulty, r.e.meaningMs, '', '', '', '',
  ])]
    .map((cols) => cols.map(esc).join(','))
    .join('\r\n') + '\r\n';

const outDir = root + 'docs/semakan/';
writeFileSync(outDir + 'senarai-semakan-kamus.csv', toCsv(rows));
rmSync(outDir + 'bahagian', { recursive: true, force: true });
mkdirSync(outDir + 'bahagian', { recursive: true });
const CHUNK = 200;
for (let i = 0; i < rows.length; i += CHUNK) {
  const n = String(i / CHUNK + 1).padStart(2, '0');
  writeFileSync(`${outDir}bahagian/bahagian-${n}.csv`, toCsv(rows.slice(i, i + CHUNK), i));
}
const count = (l: Level) => rows.filter((r) => r.level === l).length;
console.log(`${rows.length} baris: TINGGI ${count('TINGGI')}, SEDERHANA ${count('SEDERHANA')}, RENDAH ${count('RENDAH')}; ${Math.ceil(rows.length / CHUNK)} bahagian.`);
