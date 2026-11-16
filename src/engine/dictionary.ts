import { inspectJawi, isPlayableWord, normalizeJawi } from './jawi';

export type WordDifficulty = 1 | 2 | 3;

export interface LexiconEntry {
  id: string;
  /** Canonical (normalised) Jawi spelling. */
  jawi: string;
  rumi: string;
  meaningMs: string;
  category: string;
  /** 1 = Darjah 1–2, 2 = Darjah 3–4, 3 = Darjah 5–6 / loan words. */
  difficulty: WordDifficulty;
  /** Only approved entries are used by the validator, bot and hints. */
  approved: boolean;
  sourceNote: string;
  example?: string;
  /** Accepted alternate spellings (deliberate variation policy). */
  variants?: string[];
  /** Pack the entry came from ('teras' = shipped starter lexicon). */
  pack?: string;
}

export interface LexiconMeta {
  name: string;
  version: string;
  reviewStatus: 'pending-educator-review' | 'educator-reviewed';
  reviewStatusMs: string;
  license: string;
  normalization: string;
  updatedAt: string;
}

export interface LexiconFile {
  meta: LexiconMeta;
  entries: LexiconEntry[];
}

export const CATEGORY_LABELS: Record<string, string> = {
  haiwan: 'Haiwan',
  tumbuhan: 'Tumbuhan & Buah',
  alam: 'Alam',
  tubuh: 'Anggota Tubuh',
  keluarga: 'Keluarga & Orang',
  makanan: 'Makanan',
  rumah: 'Rumah & Barang',
  sekolah: 'Sekolah & Ilmu',
  tempat: 'Tempat',
  kenderaan: 'Kenderaan',
  warna: 'Warna',
  nombor: 'Nombor',
  masa: 'Masa',
  perbuatan: 'Perbuatan',
  sifat: 'Sifat',
  perasaan: 'Perasaan & Nilai',
  umum: 'Umum',
  pekerjaan: 'Pekerjaan',
  budaya: 'Agama & Budaya',
  sukan: 'Sukan & Hobi',
};

/**
 * Read-only lookup structure over APPROVED entries. The same instance is used
 * by the move validator, the bot and the hint system, so the bot can never
 * play a word the validator would reject.
 */
export class Lexicon {
  private readonly byKey = new Map<string, LexiconEntry[]>();
  /** Canonical spellings the bot may play (approved, tile-playable). */
  readonly playableWords: readonly string[];
  readonly entries: readonly LexiconEntry[];

  constructor(entries: readonly LexiconEntry[]) {
    const approved = entries.filter((e) => e.approved);
    this.entries = approved;
    const playable = new Set<string>();
    for (const entry of approved) {
      const keys = [entry.jawi, ...(entry.variants ?? [])].map(normalizeJawi);
      for (const key of keys) {
        const list = this.byKey.get(key);
        if (list) {
          if (!list.includes(entry)) list.push(entry);
        } else this.byKey.set(key, [entry]);
      }
      const canonical = normalizeJawi(entry.jawi);
      if (isPlayableWord(canonical)) playable.add(canonical);
    }
    this.playableWords = [...playable].sort();
  }

  get size(): number {
    return this.entries.length;
  }

  has(word: string): boolean {
    return this.byKey.has(normalizeJawi(word));
  }

  lookup(word: string): LexiconEntry[] {
    return this.byKey.get(normalizeJawi(word)) ?? [];
  }

  /** Lowest difficulty among entries for the word (1 = most familiar). */
  difficultyOf(word: string): WordDifficulty {
    const list = this.lookup(word);
    if (list.length === 0) return 3;
    return Math.min(...list.map((e) => e.difficulty)) as WordDifficulty;
  }

  /** Free-text search over Jawi, Rumi and meaning. */
  search(query: string, category?: string): LexiconEntry[] {
    const q = query.trim().toLowerCase();
    const qJawi = normalizeJawi(query);
    return this.entries.filter((e) => {
      if (category && e.category !== category) return false;
      if (!q) return true;
      return (
        e.rumi.toLowerCase().includes(q) ||
        e.meaningMs.toLowerCase().includes(q) ||
        (qJawi.length > 0 && e.jawi.includes(qJawi))
      );
    });
  }

  /** New lexicon with extra entries merged (e.g. a teacher word pack). */
  withExtra(extra: readonly LexiconEntry[]): Lexicon {
    return new Lexicon([...this.entries, ...extra]);
  }
}

// ---------------------------------------------------------------------------
// Import / review pipeline (teacher word packs, CSV or JSON)
// ---------------------------------------------------------------------------

export interface ImportIssue {
  row: number;
  level: 'error' | 'warning';
  message: string;
}

export interface ImportReport {
  accepted: LexiconEntry[];
  issues: ImportIssue[];
  totalRows: number;
}

export interface RawEntry {
  jawi?: unknown;
  rumi?: unknown;
  meaningMs?: unknown;
  category?: unknown;
  difficulty?: unknown;
  example?: unknown;
  variants?: unknown;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/**
 * Validate & normalise raw rows. Rejected rows never reach the game. Entries
 * produced here are `approved: true` for the importing teacher's own pack —
 * the teacher is the reviewer of their pack.
 */
export function validateImport(
  rows: readonly RawEntry[],
  opts: { pack: string; existing?: Lexicon; idPrefix?: string },
): ImportReport {
  const issues: ImportIssue[] = [];
  const accepted: LexiconEntry[] = [];
  const seen = new Set<string>();
  rows.forEach((raw, i) => {
    const row = i + 1;
    const jawiRaw = str(raw.jawi);
    const rumi = str(raw.rumi).toLowerCase();
    const meaningMs = str(raw.meaningMs);
    if (!jawiRaw) return issues.push({ row, level: 'error', message: 'Lajur "jawi" kosong.' });
    if (!rumi) return issues.push({ row, level: 'error', message: 'Lajur "rumi" kosong.' });
    if (!meaningMs) return issues.push({ row, level: 'error', message: `Makna untuk "${rumi}" kosong.` });
    const report = inspectJawi(jawiRaw);
    const jawi = report.normalized;
    if (/\s|-/.test(jawi)) {
      return issues.push({ row, level: 'error', message: `"${jawiRaw}" mengandungi ruang/sempang — hanya satu perkataan dibenarkan.` });
    }
    if (report.unknownLetters.length > 0) {
      const hint = report.suspicious.map((s) => `${s.char} → mungkin ${s.suggestion}?`).join(', ');
      return issues.push({
        row,
        level: 'error',
        message: `"${jawiRaw}" mengandungi huruf yang tiada dalam set jubin: ${report.unknownLetters.join(' ')}${hint ? ` (${hint})` : ''}`,
      });
    }
    if (!isPlayableWord(jawi)) {
      return issues.push({ row, level: 'error', message: `"${jawiRaw}" terlalu pendek (minimum 2 huruf).` });
    }
    if (report.changed) {
      issues.push({ row, level: 'warning', message: `"${jawiRaw}" dinormalkan kepada "${jawi}".` });
    }
    const key = `${jawi}|${rumi}`;
    if (seen.has(key)) return issues.push({ row, level: 'warning', message: `"${rumi}" berulang dalam fail — diabaikan.` });
    seen.add(key);
    if (opts.existing?.lookup(jawi).some((e) => e.rumi === rumi)) {
      return issues.push({ row, level: 'warning', message: `"${rumi}" sudah ada dalam kamus — diabaikan.` });
    }
    const d = Number(str(raw.difficulty) || '1');
    const difficulty = (d === 2 || d === 3 ? d : 1) as WordDifficulty;
    const category = str(raw.category).toLowerCase() || 'umum';
    const variants = Array.isArray(raw.variants)
      ? raw.variants.map((v) => normalizeJawi(str(v))).filter(Boolean)
      : str(raw.variants)
          .split(/[|;]/)
          .map((v) => normalizeJawi(v))
          .filter(Boolean);
    accepted.push({
      id: `${opts.idPrefix ?? opts.pack}-${accepted.length + 1}`,
      jawi,
      rumi,
      meaningMs,
      category,
      difficulty,
      approved: true,
      sourceNote: `Diimport oleh guru ke pek "${opts.pack}".`,
      example: str(raw.example) || undefined,
      variants: variants.length ? variants : undefined,
      pack: opts.pack,
    });
  });
  return { accepted, issues, totalRows: rows.length };
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** Convert CSV text (with header row) into raw entries. */
export function csvToRawEntries(text: string): RawEntry[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const cols = header.map((h) => h.trim());
  return body.map((cells) => {
    const obj: Record<string, string> = {};
    cols.forEach((c, i) => (obj[c] = cells[i] ?? ''));
    return obj as RawEntry;
  });
}

/** Accept either a JSON array of entries or a LexiconFile-shaped object. */
export function jsonToRawEntries(text: string): RawEntry[] {
  const data: unknown = JSON.parse(text);
  if (Array.isArray(data)) return data as RawEntry[];
  if (data && typeof data === 'object' && Array.isArray((data as { entries?: unknown }).entries)) {
    return (data as { entries: RawEntry[] }).entries;
  }
  throw new Error('Format JSON tidak dikenali: perlukan senarai entri atau { "entries": [...] }.');
}
