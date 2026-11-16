import { useMemo } from 'react';
import { coreLexicon } from '../data';
import type { Lexicon } from '../engine/dictionary';
import { usePacks } from './teacherPacks';

const cache = new Map<string, Lexicon>();

/** Core lexicon + the given teacher packs (memoised by pack ids). */
export function lexiconFor(packIds: readonly string[], packs = usePacks.getState().packs): Lexicon {
  const key = [...packIds].sort().join('|');
  const hit = cache.get(key);
  if (hit) return hit;
  const extra = packs.filter((p) => packIds.includes(p.id)).flatMap((p) => p.entries);
  const lex = extra.length ? coreLexicon().withExtra(extra) : coreLexicon();
  cache.set(key, lex);
  return lex;
}

export function enabledPackIds(): string[] {
  return usePacks.getState().packs.filter((p) => p.enabled).map((p) => p.id);
}

/** Lexicon for browsing: core + every enabled pack. */
export function useBrowseLexicon(): Lexicon {
  const packs = usePacks((s) => s.packs);
  return useMemo(() => {
    const ids = packs.filter((p) => p.enabled).map((p) => p.id);
    cache.clear();
    return lexiconFor(ids, packs);
  }, [packs]);
}
