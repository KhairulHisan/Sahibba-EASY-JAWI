/** Firestore + Cloud Functions implementation of the dictionary backend, and player suggestions. */
import type { Timestamp } from 'firebase/firestore';
import { DICT_LIMITS, DICT_TIMING, type DictionaryDoc, type SuggestionDoc, type ValidateResponse } from '../../dictionary/protocol';
import { CLOUD_FUNCTIONS_ENABLED, firebase } from '../../lib/firebase';
import type { CentralEntry, DictionaryBackend } from './checker';

const millis = (t: unknown) => (t && typeof (t as Timestamp).toMillis === 'function' ? (t as Timestamp).toMillis() : 0);

export const firebaseBackend: DictionaryBackend = {
  async getCentral(key) {
    const { db, fs } = await firebase();
    const snap = await fs.getDoc(fs.doc(db, 'dictionary', key));
    if (!snap.exists()) return null;
    const d = snap.data() as DictionaryDoc<Timestamp>;
    if (d.status !== 'verified' && d.status !== 'rejected') return null;
    const entry: CentralEntry = {
      key,
      status: d.status,
      rumi: d.rumi,
      meaningMs: d.meaningMs,
      reason: d.reason,
      source: d.source,
      evidence: { reviewedBy: d.evidence?.reviewedBy ?? '', reviewedAt: millis(d.evidence?.reviewedAt), note: d.evidence?.note ?? '' },
      revision: d.revision,
    };
    return entry;
  },

  async isPending(key) {
    const { db, fs } = await firebase();
    const snap = await fs.getDoc(fs.doc(db, 'wordSuggestions', key));
    return snap.exists() && (snap.data() as SuggestionDoc).status === 'pending';
  },

  ...(CLOUD_FUNCTIONS_ENABLED
    ? {
        async validateOnline(keys: string[]) {
          const { fns, fn } = await firebase();
          try {
            const res = await fn.httpsCallable(fns, 'validateJawiWordOnline', { timeout: DICT_TIMING.functionTimeoutMs })({ words: keys });
            return res.data as ValidateResponse;
          } catch (e) {
            const err = e as { details?: { reason?: string } };
            throw Object.assign(new Error('validateJawiWordOnline gagal'), { reason: err.details?.reason });
          }
        },
      }
    : {}),
};

export type SuggestResult = 'sent' | 'already' | 'too-soon' | 'quota' | 'reviewed' | 'error';

export const SUGGEST_MESSAGE: Record<SuggestResult, string> = {
  sent: 'Cadangan dihantar untuk semakan pentadbir. Perkataan ini belum diterima sehingga diluluskan.',
  already: 'Anda sudah mencadangkan perkataan ini. Ia sedang menunggu semakan.',
  'too-soon': 'Tunggu beberapa saat sebelum menghantar cadangan lain.',
  quota: 'Had cadangan hari ini sudah dicapai. Cuba lagi esok.',
  reviewed: 'Perkataan ini sudah disemak oleh pentadbir. Tekan "Cuba lagi" untuk keputusan terkini.',
  error: 'Cadangan tidak dapat dihantar. Semak sambungan Internet dan cuba lagi.',
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Must match firestore.rules (suggestQuota). */
export const SUGGEST_LIMITS = { perDay: 20, minGapMs: 6_000 } as const;

/**
 * Suggest a word for admin review. One transaction writes the aggregated
 * suggestion (count +1), this player's own suggestion record and the rate-limit
 * counter — the security rules accept it only as that exact combination.
 * The word is NOT added to any dictionary.
 */
export async function suggestWord(key: string, contextWords: readonly string[]): Promise<SuggestResult> {
  try {
    const { db, fs, uid } = await firebase();
    const parentRef = fs.doc(db, 'wordSuggestions', key);
    const mineRef = fs.doc(db, 'wordSuggestions', key, 'by', uid);
    const quotaRef = fs.doc(db, 'suggestQuota', uid);
    if ((await fs.getDoc(mineRef)).exists()) return 'already';
    return await fs.runTransaction(db, async (tx) => {
      const parent = await tx.get(parentRef);
      const quota = await tx.get(quotaRef);
      if (parent.exists() && (parent.data() as SuggestionDoc).status !== 'pending') return 'reviewed' as const;
      const now = Date.now();
      const ts = fs.serverTimestamp();
      if (quota.exists()) {
        const q = quota.data() as { count: number; windowStart: Timestamp; lastAt: Timestamp };
        if (now - millis(q.lastAt) < SUGGEST_LIMITS.minGapMs) return 'too-soon' as const;
        if (now - millis(q.windowStart) < DAY_MS) {
          if (q.count >= SUGGEST_LIMITS.perDay) return 'quota' as const;
          tx.set(quotaRef, { count: q.count + 1, windowStart: q.windowStart, lastAt: ts });
        } else tx.set(quotaRef, { count: 1, windowStart: ts, lastAt: ts });
      } else tx.set(quotaRef, { count: 1, windowStart: ts, lastAt: ts });
      if (parent.exists()) tx.update(parentRef, { count: fs.increment(1), lastAt: ts });
      else tx.set(parentRef, { key, word: key, status: 'pending', count: 1, firstAt: ts, lastAt: ts });
      tx.set(mineRef, { at: ts, words: contextWords.slice(0, DICT_LIMITS.maxContextWords) });
      return 'sent' as const;
    });
  } catch (e) {
    console.warn('suggestWord failed', e);
    return 'error';
  }
}
