/**
 * Smart Online Dictionary — client lookup pipeline (pure logic, injectable I/O).
 *
 *   1. local dictionary (core + teacher packs)
 *   2. device cache of authoritative verdicts (VALID / INVALID)
 *   3. central dictionary in Firestore (admin-reviewed)
 *   4. Cloud Function validateJawiWordOnline (licensed provider adapter) — when deployed
 *   5. pending player suggestion → PENDING_REVIEW, otherwise NOT_FOUND
 *
 * Network failures and timeouts give SERVICE_UNAVAILABLE — never NOT_FOUND
 * and never INVALID. Concurrent checks of the same word share one lookup.
 */
import {
  CENTRAL_SOURCE_ID,
  CLIENT_RATE,
  DICT_TIMING,
  LOCAL_SOURCE,
  REJECT_REASONS,
  dictionaryKey,
  isAcceptable,
  messageFor,
  type RejectReason,
  type ValidateResponse,
  type WordCheck,
} from '../../dictionary/protocol';

/** Central dictionary entry as the client sees it (timestamps in ms). */
export interface CentralEntry {
  key: string;
  status: 'verified' | 'rejected';
  rumi?: string;
  meaningMs?: string;
  reason?: string;
  source: { id: string; name: string; version: string };
  evidence: { reviewedBy: string; reviewedAt: number; note: string };
  revision: number;
}

export interface DictionaryBackend {
  getCentral(key: string): Promise<CentralEntry | null>;
  isPending(key: string): Promise<boolean>;
  /** Absent when Cloud Functions are not deployed (e.g. free Spark plan). */
  validateOnline?: (keys: string[]) => Promise<ValidateResponse>;
}

export interface CheckCache {
  get(key: string, now: number): WordCheck | null;
  put(check: WordCheck, now: number): void;
}

export interface CheckerOptions {
  backend: DictionaryBackend;
  cache: CheckCache;
  /** Local (shipped + teacher) dictionary membership. */
  isLocal: (key: string) => boolean;
  now?: () => number;
  online?: () => boolean;
  timeouts?: Partial<Record<'firestoreTimeoutMs' | 'functionTimeoutMs' | 'overallTimeoutMs' | 'negativeTtlMs', number>>;
  rate?: { max: number; windowMs: number };
}

export interface CheckOptions {
  signal?: AbortSignal;
  /** Skip the short-lived NOT_FOUND / PENDING memory (used by "Cuba lagi"). */
  fresh?: boolean;
}

class TimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

function abortable<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(new DOMException('Dibatalkan', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Dibatalkan', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

export function centralToCheck(word: string, e: CentralEntry, now: number): WordCheck {
  const source = { id: e.source.id || CENTRAL_SOURCE_ID, name: e.source.name, version: e.source.version };
  const evidence = { method: 'central-dictionary' as const, checkedAt: now, reviewedBy: e.evidence.reviewedBy, reviewedAt: e.evidence.reviewedAt, note: e.evidence.note, revision: e.revision };
  if (e.status === 'verified') {
    return { word, key: e.key, status: 'VALID', message: messageFor('VALID', { source }), source, evidence, rumi: e.rumi, meaningMs: e.meaningMs };
  }
  const reason = e.reason ? (REJECT_REASONS[e.reason as RejectReason] ?? e.reason) : undefined;
  return { word, key: e.key, status: 'INVALID', message: messageFor('INVALID', { source, reason }), source, evidence, reason };
}

const unavailable = (word: string, key: string, message?: string): WordCheck => ({
  word,
  key,
  status: 'SERVICE_UNAVAILABLE',
  message: message ?? messageFor('SERVICE_UNAVAILABLE'),
});

export function createChecker(o: CheckerOptions) {
  const now = o.now ?? (() => Date.now());
  // Only an explicit `false` means offline (some runtimes have no onLine at all).
  const online = o.online ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const t: Record<'firestoreTimeoutMs' | 'functionTimeoutMs' | 'overallTimeoutMs' | 'negativeTtlMs', number> = { ...DICT_TIMING, ...o.timeouts };
  const rate = o.rate ?? CLIENT_RATE;
  const inflight = new Map<string, Promise<WordCheck>>();
  const negative = new Map<string, { check: WordCheck; until: number }>();
  const lookups: number[] = [];

  /** Remember a verdict: authoritative ones on the device, NOT_FOUND/PENDING briefly in memory. */
  const remember = (c: WordCheck) => {
    if (c.status === 'VALID' || c.status === 'INVALID') {
      if (c.status === 'INVALID' || isAcceptable(c)) o.cache.put(c, now());
    } else if (c.status === 'NOT_FOUND' || c.status === 'PENDING_REVIEW') {
      negative.set(c.key, { check: c, until: now() + t.negativeTtlMs });
    }
  };

  const takeRate = (n: number) => {
    const cutoff = now() - rate.windowMs;
    while (lookups.length && lookups[0]! <= cutoff) lookups.shift();
    if (lookups.length + n > rate.max) return false;
    for (let i = 0; i < n; i++) lookups.push(now());
    return true;
  };

  /** Network part for a batch of keys that missed every local layer. */
  async function lookup(batch: { word: string; key: string }[]): Promise<Map<string, WordCheck>> {
    const out = new Map<string, WordCheck>();
    // 3. central dictionary
    const unresolved: { word: string; key: string }[] = [];
    await Promise.all(
      batch.map(async ({ word, key }) => {
        try {
          const entry = await withTimeout(o.backend.getCentral(key), t.firestoreTimeoutMs);
          if (entry) out.set(key, centralToCheck(word, entry, now()));
          else unresolved.push({ word, key });
        } catch {
          out.set(key, unavailable(word, key));
        }
      }),
    );
    if (!unresolved.length) return out;

    // 4. licensed provider via the Cloud Function (it also reports pending suggestions)
    if (o.backend.validateOnline) {
      try {
        const res = await withTimeout(
          o.backend.validateOnline(unresolved.map((u) => u.key)),
          t.functionTimeoutMs,
        );
        const byKey = new Map(res.results.map((r) => [r.key, r]));
        for (const { word, key } of unresolved) {
          const r = byKey.get(key);
          out.set(key, r ? { ...r, word } : unavailable(word, key));
        }
      } catch (e) {
        const msg = (e as { reason?: string }).reason === 'TERLALU_BANYAK_CUBAAN' ? 'Terlalu banyak semakan. Tunggu sebentar dan cuba lagi.' : undefined;
        for (const { word, key } of unresolved) out.set(key, unavailable(word, key, msg));
      }
      return out;
    }

    // 5. no provider deployed: a pending player suggestion, else NOT_FOUND
    await Promise.all(
      unresolved.map(async ({ word, key }) => {
        let pending = false;
        try {
          pending = await withTimeout(o.backend.isPending(key), t.firestoreTimeoutMs);
        } catch {
          /* the central lookup already succeeded: NOT_FOUND is still accurate */
        }
        out.set(
          key,
          pending
            ? { word, key, status: 'PENDING_REVIEW', message: messageFor('PENDING_REVIEW') }
            : { word, key, status: 'NOT_FOUND', message: messageFor('NOT_FOUND', { providerConfigured: false }) },
        );
      }),
    );
    return out;
  }

  async function checkWords(words: readonly string[], opts: CheckOptions = {}): Promise<WordCheck[]> {
    const results = new Map<string, Promise<WordCheck>>();
    const toFetch: { word: string; key: string }[] = [];
    const order: { word: string; key: string | null }[] = words.map((w) => ({ word: w, key: dictionaryKey(w) }));

    for (const { word, key } of order) {
      if (!key || results.has(key)) continue;
      // 1. local dictionary
      if (o.isLocal(key)) {
        results.set(key, Promise.resolve({ word, key, status: 'VALID', message: messageFor('VALID', { source: LOCAL_SOURCE }), source: LOCAL_SOURCE, evidence: { method: 'local', checkedAt: now() } }));
        continue;
      }
      // 2. device cache (authoritative verdicts only)
      const hit = o.cache.get(key, now());
      if (hit) {
        results.set(key, Promise.resolve({ ...hit, word, cached: true }));
        continue;
      }
      const neg = negative.get(key);
      if (neg && !opts.fresh && neg.until > now()) {
        results.set(key, Promise.resolve({ ...neg.check, word, cached: true }));
        continue;
      }
      // Same word already being looked up (another tap, another component): share it.
      const running = inflight.get(key);
      if (running) {
        results.set(key, running.then((r) => ({ ...r, word })));
        continue;
      }
      toFetch.push({ word, key });
    }

    if (toFetch.length) {
      let batch: Promise<Map<string, WordCheck>>;
      if (!online()) batch = Promise.resolve(new Map(toFetch.map(({ word, key }) => [key, unavailable(word, key, 'Peranti tiada sambungan Internet. Jubin anda kekal di papan — cuba lagi apabila sambungan pulih.')])));
      else if (!takeRate(toFetch.length)) batch = Promise.resolve(new Map(toFetch.map(({ word, key }) => [key, unavailable(word, key, 'Had semakan kamus online dicapai. Tunggu beberapa minit dan cuba lagi.')])));
      else
        batch = withTimeout(lookup(toFetch), t.overallTimeoutMs).catch(() => new Map(toFetch.map(({ word, key }) => [key, unavailable(word, key)])));
      for (const { word, key } of toFetch) {
        const p = batch.then((m) => {
          const c = m.get(key) ?? unavailable(word, key);
          remember(c);
          return c;
        });
        inflight.set(key, p);
        void p.finally(() => inflight.get(key) === p && inflight.delete(key));
        results.set(key, p);
      }
    }

    const settled = await abortable(Promise.all([...results.entries()].map(async ([k, p]) => [k, await p] as const)), opts.signal);
    const byKey = new Map(settled);
    return order.map(({ word, key }) =>
      key ? { ...byKey.get(key)!, word } : { word, key: word, status: 'NOT_FOUND' as const, message: 'Mengandungi huruf yang bukan huruf jubin Jawi.' },
    );
  }

  /** After a player suggests a word: show PENDING_REVIEW at once. */
  const markPending = (word: string, key: string) =>
    negative.set(key, { check: { word, key, status: 'PENDING_REVIEW', message: messageFor('PENDING_REVIEW') }, until: now() + t.negativeTtlMs });

  return { checkWords, markPending };
}

export type DictionaryChecker = ReturnType<typeof createChecker>;
