import { JAWI_ALPHABET, isPlayableWord, normalizeJawi, splitLetters } from './jawi';

export interface TileSpec {
  letter: string;
  count: number;
  value: number;
}

export interface TileDistribution {
  meta: {
    derivedFrom: string;
    method: string;
    disclaimer: string;
    totalLetterTiles: number;
    blanks: number;
  };
  tiles: TileSpec[];
  blank: { count: number; value: 0 };
}

export interface DeriveOptions {
  totalLetterTiles: number;
  blanks: number;
  /** A letter must appear in at least this many words to get tiles. */
  minWords: number;
  maxPerLetter: number;
  /** Steepness of the value curve. */
  valueScale: number;
}

export const DEFAULT_DERIVE_OPTIONS: DeriveOptions = {
  totalLetterTiles: 86,
  blanks: 2,
  minWords: 5,
  maxPerLetter: 11,
  valueScale: 1.25,
};

/**
 * Derive tile counts and point values from letter frequency in a word list.
 * Deterministic: same corpus + options ⇒ same distribution. Scores are NOT
 * official Sahibba values — they are derived from the starter corpus.
 */
export function deriveDistribution(words: readonly string[], opts: DeriveOptions = DEFAULT_DERIVE_OPTIONS): TileDistribution {
  const freq = new Map<string, number>();
  const wordsWith = new Map<string, number>();
  const unique = [...new Set(words.map(normalizeJawi))].filter(isPlayableWord);
  for (const w of unique) {
    const letters = splitLetters(w);
    for (const ch of letters) freq.set(ch, (freq.get(ch) ?? 0) + 1);
    for (const ch of new Set(letters)) wordsWith.set(ch, (wordsWith.get(ch) ?? 0) + 1);
  }
  const eligible = JAWI_ALPHABET.map((l) => l.char).filter((ch) => (wordsWith.get(ch) ?? 0) >= opts.minWords);
  const maxFreq = Math.max(...eligible.map((ch) => freq.get(ch) ?? 0));

  // Every eligible letter gets 1 tile; the rest is apportioned ∝ frequency
  // with the largest-remainder method, respecting the per-letter cap.
  const counts = new Map(eligible.map((ch) => [ch, 1]));
  let remaining = opts.totalLetterTiles - eligible.length;
  let pool = [...eligible];
  while (remaining > 0 && pool.length > 0) {
    const poolSum = pool.reduce((a, ch) => a + (freq.get(ch) ?? 0), 0);
    const shares = pool.map((ch) => ({ ch, exact: (remaining * (freq.get(ch) ?? 0)) / poolSum }));
    let given = 0;
    for (const s of shares) {
      const add = Math.min(Math.floor(s.exact), opts.maxPerLetter - counts.get(s.ch)!);
      counts.set(s.ch, counts.get(s.ch)! + add);
      given += add;
    }
    const byRemainder = [...shares].sort((a, b) => (b.exact % 1) - (a.exact % 1) || a.ch.localeCompare(b.ch));
    for (const s of byRemainder) {
      if (given >= remaining) break;
      if (counts.get(s.ch)! < opts.maxPerLetter) {
        counts.set(s.ch, counts.get(s.ch)! + 1);
        given++;
      }
    }
    remaining -= given;
    pool = pool.filter((ch) => counts.get(ch)! < opts.maxPerLetter);
    if (given === 0) break;
  }

  const tiles: TileSpec[] = eligible.map((ch) => {
    const f = freq.get(ch) ?? 1;
    const value = Math.min(10, Math.max(1, 1 + Math.round(Math.log2(maxFreq / f) * opts.valueScale)));
    return { letter: ch, count: counts.get(ch)!, value };
  });

  return {
    meta: {
      derivedFrom: `${unique.length} perkataan unik dalam kamus permulaan`,
      method: `Bilangan jubin ∝ kekerapan huruf (largest remainder, min 1, maks ${opts.maxPerLetter}); huruf perlu muncul dalam ≥ ${opts.minWords} perkataan. Nilai = 1 + round(log2(fmaks/f) × ${opts.valueScale}), had 1–10.`,
      disclaimer: 'Taburan dan nilai jubin diterbitkan daripada korpus permulaan EASY JAWI. BUKAN nilai rasmi Sahibba. Boleh dikonfigurasi.',
      totalLetterTiles: tiles.reduce((a, t) => a + t.count, 0),
      blanks: opts.blanks,
    },
    tiles,
    blank: { count: opts.blanks, value: 0 },
  };
}
