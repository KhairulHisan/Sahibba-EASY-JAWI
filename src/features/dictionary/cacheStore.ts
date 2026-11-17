import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DICT_TIMING, isAcceptable, type WordCheck } from '../../dictionary/protocol';
import type { CheckCache } from './checker';

interface CachedCheck {
  check: WordCheck;
  expiresAt: number;
}

interface DictCacheStore {
  /** Only authoritative verdicts: acceptable VALID, or INVALID. */
  entries: Record<string, CachedCheck>;
  put: (c: WordCheck, now: number) => void;
  clear: () => void;
}

/** Device cache of online-dictionary verdicts (survives reloads, expires by TTL). */
export const useDictCache = create<DictCacheStore>()(
  persist(
    (set) => ({
      entries: {},
      put: (c, now) => {
        if (!(c.status === 'INVALID' || isAcceptable(c))) return;
        const ttl = c.status === 'VALID' ? DICT_TIMING.validTtlMs : DICT_TIMING.invalidTtlMs;
        const { cached: _c, ...check } = c;
        set((s) => {
          const entries: Record<string, CachedCheck> = {};
          for (const [k, v] of Object.entries(s.entries)) if (v.expiresAt > now) entries[k] = v; // prune
          entries[c.key] = { check, expiresAt: now + ttl };
          return { entries };
        });
      },
      clear: () => set({ entries: {} }),
    }),
    { name: 'easy-jawi:kamus-online:v1', storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);

export const persistentCache: CheckCache = {
  get: (key, now) => {
    const e = useDictCache.getState().entries[key];
    return e && e.expiresAt > now ? e.check : null;
  },
  put: (c, now) => useDictCache.getState().put(c, now),
};

/** Unexpired, acceptable VALID verdicts — the words the player may score with. */
export function knownVerified(entries: Record<string, CachedCheck>, now = Date.now()): WordCheck[] {
  return Object.values(entries)
    .filter((e) => e.expiresAt > now && isAcceptable(e.check))
    .map((e) => e.check);
}
