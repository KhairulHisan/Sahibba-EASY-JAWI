import { describe, expect, it } from 'vitest';
import { codePoints, inspectJawi, isPlayableWord, JAWI_ALPHABET, normalizeJawi, splitLetters } from '../../src/engine/jawi';

describe('normalizeJawi — canonical letters', () => {
  it('folds Arabic kaf ك (U+0643) to keheh ک (U+06A9)', () => {
    expect(normalizeJawi('كاكي')).toBe('کاکي');
    expect(codePoints(normalizeJawi('ك'))).toBe('U+06A9');
  });

  it('folds gaf گ and ڬ to DBP ga ݢ (U+0762)', () => {
    expect(normalizeJawi('گولا')).toBe('ݢولا');
    expect(normalizeJawi('ڬولا')).toBe('ݢولا');
    expect(codePoints(normalizeJawi('ڬ'))).toBe('U+0762');
  });

  it('folds Farsi yeh ی to ي and heh doachashmee ھ to ه', () => {
    expect(normalizeJawi('کامی')).toBe('کامي');
    expect(normalizeJawi('ھاتي')).toBe('هاتي');
  });

  it('decomposes Arabic presentation forms (shaped glyphs) to base letters', () => {
    // ﺑ (FE91) ﻮ (FEEE) ﻛ (FEDB, Arabic kaf) ﻮ (FEEE) → بوکو
    expect(normalizeJawi('ﺑﻮﻛﻮ')).toBe('بوکو');
    // ﮐ keheh initial form (FB90)
    expect(normalizeJawi('ﮐ')).toBe('ک');
  });

  it('removes zero-width, bidi controls and tatweel', () => {
    expect(normalizeJawi('بو‌کو')).toBe('بوکو');
    expect(normalizeJawi('‏بوکو‎')).toBe('بوکو');
    expect(normalizeJawi('بـــوکو')).toBe('بوکو');
    expect(normalizeJawi('﻿بوکو')).toBe('بوکو');
  });

  it('strips harakat but never hamza', () => {
    expect(normalizeJawi('بُوکُو')).toBe('بوکو');
    expect(normalizeJawi('اءير')).toBe('اءير');
    // alif + combining hamza above composes (NFC) to أ and is kept distinct from ا
    expect(normalizeJawi('أ')).toBe('أ');
    expect(normalizeJawi('أ')).not.toBe(normalizeJawi('ا'));
    expect(normalizeJawi('ؤ')).toBe('ؤ');
  });

  it('does NOT merge genuinely distinct letters', () => {
    expect(normalizeJawi('پ')).toBe('پ'); // Persian peh is not Jawi pa ڤ
    expect(normalizeJawi('ى')).toBe('ى'); // alif maksura kept
    expect(normalizeJawi('ۋ')).toBe('ۋ');
  });

  it('never reverses strings — logical order is preserved', () => {
    const w = normalizeJawi('بوکو');
    expect(splitLetters(w)).toEqual(['ب', 'و', 'ک', 'و']);
    expect(w.startsWith('ب')).toBe(true);
  });

  it('is idempotent', () => {
    for (const s of ['كاكي', 'ڬولا', 'ﺑﻮﻛﻮ', 'بُوکُو']) {
      expect(normalizeJawi(normalizeJawi(s))).toBe(normalizeJawi(s));
    }
  });
});

describe('inspectJawi — import diagnostics', () => {
  it('flags look-alike letters with a suggestion instead of silently rewriting', () => {
    const r = inspectJawi('پاسير');
    expect(r.unknownLetters).toEqual(['پ']);
    expect(r.suspicious).toEqual([{ char: 'پ', suggestion: 'ڤ' }]);
  });

  it('reports when normalisation changed the input', () => {
    expect(inspectJawi('كاكي').changed).toBe(true);
    expect(inspectJawi('کاکي').changed).toBe(false);
  });
});

describe('alphabet', () => {
  it('contains the Jawi-specific letters', () => {
    const chars = JAWI_ALPHABET.map((l) => l.char);
    for (const ch of ['چ', 'ڠ', 'ڤ', 'ک', 'ݢ', 'ۏ', 'ڽ', 'ء']) expect(chars).toContain(ch);
    expect(new Set(chars).size).toBe(chars.length);
  });

  it('isPlayableWord requires ≥2 tile letters', () => {
    expect(isPlayableWord('بس')).toBe(true);
    expect(isPlayableWord('ب')).toBe(false);
    expect(isPlayableWord('پاسير')).toBe(false);
  });
});
