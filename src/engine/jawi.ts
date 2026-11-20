/**
 * Jawi alphabet + canonical normalisation policy.
 *
 * POLICY (see docs/BLUEPRINT.md §3 — must be reviewed by an educator):
 *  - Canonical kaf  = ک U+06A9 (KEHEH). Input ك U+0643 is folded to it.
 *  - Canonical ga   = ݢ U+0762 (KEHEH WITH DOT ABOVE, DBP Malaysia).
 *                     Input ڬ U+06AC and گ U+06AF are folded to it.
 *  - Canonical ya   = ي U+064A. Farsi yeh ی U+06CC is folded to it.
 *  - Canonical ha   = ه U+0647. Heh doachashmee ھ U+06BE is folded to it.
 *  - Hamza forms (ء أ إ ؤ ئ) are DISTINCT letters and are never merged.
 *  - ى (alif maksura), پ (Persian peh), ۋ, ڼ etc. are NOT merged — they are
 *    genuinely distinct letters. The lexicon validator warns about them as
 *    probable typos of ڤ / ۏ / ڽ instead of silently rewriting them.
 *  - Arabic presentation forms (U+FB50–FDFF, U+FE70–FEFF) are decomposed with
 *    NFKC to their base letters; the whole string is then NFC-normalised.
 *  - Zero-width / bidi control characters and tatweel are removed.
 *  - Harakat (short-vowel marks) are stripped — normal Malay Jawi does not use
 *    them. Hamza above/below (U+0654/U+0655) are composed by NFC first and are
 *    never stripped.
 *  - Strings are NEVER reversed: logical order is Unicode order; the browser
 *    performs RTL layout and contextual shaping.
 */

export interface JawiLetter {
  /** Canonical code point. */
  char: string;
  /** Malay letter name. */
  name: string;
  /** Approximate Rumi sound hint for learners. */
  sound: string;
}

/** Ordered Jawi alphabet used for tiles (Pedoman Umum Ejaan Jawi order). */
export const JAWI_ALPHABET: readonly JawiLetter[] = [
  { char: 'ا', name: 'alif', sound: 'a' },
  { char: 'ب', name: 'ba', sound: 'b' },
  { char: 'ت', name: 'ta', sound: 't' },
  { char: 'ة', name: 'ta marbutah', sound: 't/h' },
  { char: 'ث', name: 'sa', sound: 's (th)' },
  { char: 'ج', name: 'jim', sound: 'j' },
  { char: 'چ', name: 'ca', sound: 'c' },
  { char: 'ح', name: 'ha (ḥa)', sound: 'h' },
  { char: 'خ', name: 'kha', sound: 'kh' },
  { char: 'د', name: 'dal', sound: 'd' },
  { char: 'ذ', name: 'zal', sound: 'z (dh)' },
  { char: 'ر', name: 'ra', sound: 'r' },
  { char: 'ز', name: 'zai', sound: 'z' },
  { char: 'س', name: 'sin', sound: 's' },
  { char: 'ش', name: 'syin', sound: 'sy' },
  { char: 'ص', name: 'sad', sound: 's (ṣ)' },
  { char: 'ض', name: 'dad', sound: 'd (ḍ)' },
  { char: 'ط', name: 'ta (ṭa)', sound: 't (ṭ)' },
  { char: 'ظ', name: 'za (ẓa)', sound: 'z (ẓ)' },
  { char: 'ع', name: 'ain', sound: "'a / 'i / 'u" },
  { char: 'غ', name: 'ghain', sound: 'gh' },
  { char: 'ڠ', name: 'nga', sound: 'ng' },
  { char: 'ف', name: 'fa', sound: 'f' },
  { char: 'ڤ', name: 'pa', sound: 'p' },
  { char: 'ق', name: 'qaf', sound: 'q / k' },
  { char: 'ک', name: 'kaf', sound: 'k' },
  { char: 'ݢ', name: 'ga', sound: 'g' },
  { char: 'ل', name: 'lam', sound: 'l' },
  { char: 'م', name: 'mim', sound: 'm' },
  { char: 'ن', name: 'nun', sound: 'n' },
  { char: 'و', name: 'wau', sound: 'w / u / o' },
  { char: 'ۏ', name: 'va', sound: 'v' },
  { char: 'ه', name: 'ha', sound: 'h' },
  { char: 'ء', name: 'hamzah', sound: "'" },
  { char: 'ي', name: 'ya', sound: 'y / i / e' },
  { char: 'ڽ', name: 'nya', sound: 'ny' },
];

export const JAWI_LETTER_SET: ReadonlySet<string> = new Set(JAWI_ALPHABET.map((l) => l.char));

const LETTER_BY_CHAR = new Map(JAWI_ALPHABET.map((l) => [l.char, l]));

export function letterInfo(char: string): JawiLetter | undefined {
  return LETTER_BY_CHAR.get(char);
}

/** Non-canonical → canonical folds. Only true orthographic variants live here. */
export const VARIANT_FOLDS: Readonly<Record<string, string>> = {
  'ك': 'ک', // ك Arabic kaf → ک keheh
  'گ': 'ݢ', // گ gaf → ݢ
  'ڬ': 'ݢ', // ڬ kaf with dot above → ݢ
  'ی': 'ي', // ی Farsi yeh → ي
  'ھ': 'ه', // ھ heh doachashmee → ه
};

/**
 * Look-alike letters that are NOT folded (they are distinct letters), but are
 * very likely typing mistakes in Malay Jawi. Used for import warnings only.
 */
export const SUSPICIOUS_LOOKALIKES: Readonly<Record<string, string>> = {
  'پ': 'ڤ', // پ (Persian peh) – did you mean ڤ ?
  'ۋ': 'ۏ', // ۋ – did you mean ۏ ?
  'ڼ': 'ڽ', // ڼ – did you mean ڽ ?
  'ى': 'ي', // ى (alif maksura) – did you mean ي ?
  'ڢ': 'ڤ', // ڢ – did you mean ڤ ?
};

const INVISIBLE = /[​-‏‪-‮⁠-⁤⁦-⁩؜﻿­ـ]/g;
/** Harakat + Quranic annotation marks; deliberately excludes U+0654/U+0655 (hamza). */
const HARAKAT = /[ً-ٖٓ-ٰٟۖ-ۭ]/g;
const PRESENTATION_FORM = /[ﭐ-﷿ﹰ-﻿]/g;
const WHITESPACE = /\s+/g;

/** Normalise any user / dataset Jawi string to the canonical form. */
export function normalizeJawi(input: string): string {
  let s = input.replace(PRESENTATION_FORM, (ch) => ch.normalize('NFKC'));
  s = s.replace(INVISIBLE, '');
  s = s.normalize('NFC');
  s = s.replace(HARAKAT, '');
  let out = '';
  for (const ch of s) out += VARIANT_FOLDS[ch] ?? ch;
  return out.replace(WHITESPACE, ' ').trim();
}

/** Split a canonical Jawi word into tile letters (code points, logical order). */
export function splitLetters(word: string): string[] {
  return Array.from(word);
}

/** True if every letter of the (canonical) word exists as a tile letter. */
export function isPlayableWord(word: string): boolean {
  const letters = splitLetters(word);
  return letters.length >= 2 && letters.every((ch) => JAWI_LETTER_SET.has(ch));
}

export interface NormalizationReport {
  input: string;
  normalized: string;
  changed: boolean;
  unknownLetters: string[];
  suspicious: { char: string; suggestion: string }[];
}

/** Explain what normalisation did — used by the teacher import pipeline. */
export function inspectJawi(input: string): NormalizationReport {
  const normalized = normalizeJawi(input);
  const unknownLetters: string[] = [];
  const suspicious: { char: string; suggestion: string }[] = [];
  for (const ch of normalized) {
    if (ch === ' ') continue;
    if (!JAWI_LETTER_SET.has(ch)) {
      if (!unknownLetters.includes(ch)) unknownLetters.push(ch);
      const suggestion = SUSPICIOUS_LOOKALIKES[ch];
      if (suggestion && !suspicious.some((x) => x.char === ch)) suspicious.push({ char: ch, suggestion });
    }
  }
  return { input, normalized, changed: normalized !== input, unknownLetters, suspicious };
}

/** Human-readable code point listing, e.g. "U+06A9 U+0648". Useful in admin UI. */
export function codePoints(s: string): string {
  return Array.from(s)
    .map((c) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0'))
    .join(' ');
}
