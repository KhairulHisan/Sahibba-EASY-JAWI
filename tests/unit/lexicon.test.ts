import { describe, expect, it } from 'vitest';
import { LEXICON_FILE, TILE_DISTRIBUTION, coreLexicon } from '../../src/data';
import { CATEGORY_LABELS, Lexicon, csvToRawEntries, jsonToRawEntries, parseCsv, validateImport } from '../../src/engine/dictionary';
import { isPlayableWord, normalizeJawi } from '../../src/engine/jawi';
import { deriveDistribution } from '../../src/engine/tiles';
import { entry } from './helpers';

describe('shipped starter lexicon integrity', () => {
  const entries = LEXICON_FILE.entries;

  it('is honestly labelled as pending educator review', () => {
    expect(LEXICON_FILE.meta.reviewStatus).toBe('pending-educator-review');
    expect(LEXICON_FILE.meta.reviewStatusMs).toMatch(/BELUM DISEMAK GURU/);
    expect(entries.length).toBeGreaterThanOrEqual(400);
  });

  it('every entry is canonical, playable and complete', () => {
    const ids = new Set<string>();
    const keys = new Set<string>();
    for (const e of entries) {
      expect(e.jawi, e.rumi).toBe(normalizeJawi(e.jawi));
      expect(isPlayableWord(e.jawi), e.rumi).toBe(true);
      expect(e.rumi).toMatch(/^[a-z]+$/);
      expect(e.meaningMs.length, e.rumi).toBeGreaterThan(3);
      expect(CATEGORY_LABELS[e.category], e.category).toBeDefined();
      expect([1, 2, 3]).toContain(e.difficulty);
      expect(typeof e.approved).toBe('boolean');
      expect(e.sourceNote.length).toBeGreaterThan(10);
      expect(ids.has(e.id)).toBe(false);
      ids.add(e.id);
      const key = `${e.jawi}|${e.rumi}`;
      expect(keys.has(key), key).toBe(false);
      keys.add(key);
    }
  });

  it('uses canonical kaf/ga, never the folded variants', () => {
    const all = entries.map((e) => e.jawi).join('');
    expect(all).not.toMatch(/[كگڬیھ]/);
    expect(all).toContain('ک');
    expect(all).toContain('ݢ');
  });

  it('only approved entries are visible to the game', () => {
    const lex = new Lexicon([entry('بوکو', 'buku'), entry('سوسو', 'susu', { approved: false })]);
    expect(lex.has('بوکو')).toBe(true);
    expect(lex.has('سوسو')).toBe(false);
    expect(lex.playableWords).toEqual(['بوکو']);
  });

  it('looks up words through normalisation (non-canonical input still matches)', () => {
    const lex = coreLexicon();
    expect(lex.has('بوكو')).toBe(true); // Arabic kaf typed
    expect(lex.has('ﺑﻮﻛﻮ')).toBe(true); // presentation forms
    expect(lex.lookup('بوکو')[0]?.rumi).toBe('buku');
  });

  it('accepts deliberate variant spellings without letting the bot play them', () => {
    const lex = new Lexicon([entry('کامڤوڠ', 'kampung', { variants: ['کمڤوڠ'] })]);
    expect(lex.has('کمڤوڠ')).toBe(true);
    expect(lex.lookup('کمڤوڠ')[0]?.rumi).toBe('kampung');
    expect(lex.playableWords).toEqual(['کامڤوڠ']);
  });

  it('search matches rumi, meaning and Jawi, with category filter', () => {
    const lex = coreLexicon();
    expect(lex.search('kucing').some((e) => e.jawi === 'کوچيڠ')).toBe(true);
    expect(lex.search('کوچيڠ').some((e) => e.rumi === 'kucing')).toBe(true);
    expect(lex.search('', 'warna').every((e) => e.category === 'warna')).toBe(true);
  });
});

describe('tile distribution', () => {
  it('committed JSON matches the derivation from the lexicon (run npm run tiles:derive)', () => {
    const derived = deriveDistribution(LEXICON_FILE.entries.filter((e) => e.approved).map((e) => e.jawi));
    expect(TILE_DISTRIBUTION).toEqual(derived);
  });

  it('has 86 letter tiles + 2 jokers and is labelled as unofficial', () => {
    expect(TILE_DISTRIBUTION.tiles.reduce((a, t) => a + t.count, 0)).toBe(86);
    expect(TILE_DISTRIBUTION.blank).toEqual({ count: 2, value: 0 });
    expect(TILE_DISTRIBUTION.meta.disclaimer).toMatch(/BUKAN nilai rasmi/);
  });

  it('frequent letters are cheap, rare letters are valuable', () => {
    const v = (ch: string) => TILE_DISTRIBUTION.tiles.find((t) => t.letter === ch)!;
    expect(v('ا').value).toBe(1);
    expect(v('ا').count).toBeGreaterThan(v('ڽ').count);
    expect(v('ڽ').value).toBeGreaterThan(v('ا').value);
  });

  it('every tile letter appears in at least 2 dictionary words', () => {
    for (const t of TILE_DISTRIBUTION.tiles) {
      const n = LEXICON_FILE.entries.filter((e) => e.jawi.includes(t.letter)).length;
      expect(n, t.letter).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('teacher import pipeline', () => {
  it('parses quoted CSV fields, commas and CRLF', () => {
    const rows = parseCsv('a,b\r\n"x, y","say ""hi"""\r\n');
    expect(rows).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
  });

  it('normalises, validates and explains every rejected row', () => {
    const csv = [
      'jawi,rumi,meaningMs,category,difficulty',
      'كاتق,katak,Haiwan yang melompat,haiwan,1', // Arabic kaf → normalised (warning)
      'کنچيل,kancil,Haiwan kecil yang cerdik,haiwan,1',
      'پاسير,pasir,Butiran halus,alam,1', // Persian peh → error + suggestion
      'بوکو,buku,Sudah ada,sekolah,1', // already in core lexicon
      'کنچيل,kancil,Ulang,haiwan,1', // duplicate in file
      'کاکي ايم,kaki ayam,Dua perkataan,umum,1', // multi-word
      ',kosong,Tiada jawi,umum,1',
    ].join('\n');
    const report = validateImport(csvToRawEntries(csv), { pack: 'D2-haiwan', existing: coreLexicon() });
    expect(report.totalRows).toBe(7);
    const accepted = report.accepted.map((e) => e.rumi);
    expect(accepted).toEqual(['kancil']); // katak & buku already exist in the core lexicon
    expect(report.issues.some((i) => i.message.includes('sudah ada dalam kamus'))).toBe(true);
    expect(accepted).not.toContain('pasir');
    expect(report.issues.some((i) => i.level === 'error' && i.message.includes('mungkin ڤ'))).toBe(true);
    expect(report.issues.some((i) => i.level === 'warning' && i.message.includes('dinormalkan'))).toBe(true);
    expect(report.issues.some((i) => i.message.includes('berulang'))).toBe(true);
    expect(report.issues.some((i) => i.message.includes('ruang/sempang'))).toBe(true);
    expect(report.issues.some((i) => i.message.includes('"jawi" kosong'))).toBe(true);
    for (const e of report.accepted) {
      expect(e.pack).toBe('D2-haiwan');
      expect(e.approved).toBe(true);
    }
  });

  it('accepts JSON arrays or {entries: [...]}', () => {
    expect(jsonToRawEntries('[{"jawi":"بس","rumi":"bas"}]')).toHaveLength(1);
    expect(jsonToRawEntries('{"entries":[{"jawi":"بس"}]}')).toHaveLength(1);
    expect(() => jsonToRawEntries('{"x":1}')).toThrow(/Format JSON/);
  });
});
