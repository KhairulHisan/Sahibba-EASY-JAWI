/**
 * Smart Online Jawi Dictionary — server logic for `validateJawiWordOnline`.
 *
 * Order per word: central dictionary (admin-reviewed) → server cache of the
 * provider's verdicts → licensed provider adapter → pending suggestion.
 * The provider is an adapter interface: NO real provider is wired in this
 * repository (no licensed API is available yet). We never call or scrape a
 * service we have no permission to use. Provider API keys live only in Secret
 * Manager on the server and are never sent to clients.
 */
import {
  CENTRAL_SOURCE_ID,
  DICT_LIMITS,
  DICT_TIMING,
  REJECT_REASONS,
  SERVER_RATE,
  dictionaryKey,
  messageFor,
  type ProviderInfo,
  type RejectReason,
  type ValidateResponse,
  type WordCheck,
} from '../../src/dictionary/protocol';
import type { Repo } from './repo';
import { RoomError } from './rooms';

export interface ProviderVerdict {
  status: 'VALID' | 'INVALID' | 'NOT_FOUND';
  /** Provider's own entry id / citation. */
  reference?: string;
  rumi?: string;
  meaningMs?: string;
  reason?: string;
}

export interface DictionaryProvider {
  readonly info: ProviderInfo;
  /** Must throw on any failure: the caller turns that into SERVICE_UNAVAILABLE. */
  lookup(keys: string[], signal: AbortSignal): Promise<Map<string, ProviderVerdict>>;
}

/** Default: no external provider is configured. Everything not in the central dictionary is NOT_FOUND. */
export const NO_PROVIDER: DictionaryProvider = {
  info: { id: 'none', name: 'Tiada penyedia kamus luar', version: '-', configured: false },
  lookup: async (keys) => new Map(keys.map((k) => [k, { status: 'NOT_FOUND' as const }])),
};

/** A provider was selected but its settings are incomplete: fail loudly, never guess. */
export function misconfiguredProvider(problem: string): DictionaryProvider {
  return {
    info: { id: 'misconfigured', name: 'Penyedia kamus (tetapan tidak lengkap)', version: '-', configured: true },
    lookup: async () => {
      throw new Error(`Dictionary provider misconfigured: ${problem}`);
    },
  };
}

/**
 * Strict parser for the generic JSON contract (docs/KAMUS_ONLINE.md):
 *   { "results": [ { "word": "…", "status": "VALID"|"INVALID"|"NOT_FOUND", "reference"?: "…" } ] }
 * Anything unexpected or incomplete throws — an unparseable answer is never VALID.
 */
export function parseProviderResponse(body: unknown, keys: readonly string[]): Map<string, ProviderVerdict> {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { results?: unknown }).results)) throw new Error('provider: missing results');
  const out = new Map<string, ProviderVerdict>();
  const wanted = new Set(keys);
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : undefined);
  for (const item of (body as { results: unknown[] }).results) {
    if (!item || typeof item !== 'object') throw new Error('provider: bad item');
    const r = item as Record<string, unknown>;
    const key = typeof r.word === 'string' ? dictionaryKey(r.word) : null;
    if (!key || !wanted.has(key)) continue;
    if (r.status !== 'VALID' && r.status !== 'INVALID' && r.status !== 'NOT_FOUND') throw new Error('provider: bad status');
    out.set(key, { status: r.status, reference: text(r.reference, 200), rumi: text(r.rumi, 60), meaningMs: text(r.meaningMs, 300), reason: text(r.reason, 200) });
  }
  for (const k of keys) if (!out.has(k)) throw new Error('provider: incomplete answer');
  return out;
}

/**
 * Generic adapter for a LICENSED provider that exposes (or is fronted by a small
 * proxy exposing) the JSON contract above over HTTPS with a bearer key. A real
 * provider will most likely need its own small adapter class — the contract
 * here is ours, not any provider's published API.
 */
export class HttpJsonProvider implements DictionaryProvider {
  readonly info: ProviderInfo;
  constructor(
    private readonly cfg: { id: string; name: string; version: string; licence?: string; url: string; apiKey: () => string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.info = { id: cfg.id, name: cfg.name, version: cfg.version, licence: cfg.licence, configured: true };
  }

  async lookup(keys: string[], signal: AbortSignal): Promise<Map<string, ProviderVerdict>> {
    const res = await this.fetchImpl(this.cfg.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.cfg.apiKey()}` },
      body: JSON.stringify({ words: keys }),
      signal,
    });
    if (!res.ok) throw new Error(`provider HTTP ${res.status}`);
    return parseProviderResponse(await res.json(), keys);
  }
}

// ---------------------------------------------------------------------------

export interface DictCtx {
  repo: Repo;
  uid: string;
  now: number;
  provider: DictionaryProvider;
  providerTimeoutMs?: number;
}

export const DICT_PATHS = {
  central: (key: string) => `dictionary/${key}`,
  suggestion: (key: string) => `wordSuggestions/${key}`,
  cache: (providerId: string, key: string) => `dictionaryCache/${providerId}__${key}`,
  limit: (uid: string) => `dictRateLimits/${uid}`,
};

interface CentralDoc {
  key: string;
  status: 'verified' | 'rejected';
  rumi?: string;
  meaningMs?: string;
  reason?: string;
  source: { id: string; name: string; version: string };
  evidence: { reviewedBy: string; reviewedAt: unknown; note: string };
  revision: number;
}
interface CacheDoc extends ProviderVerdict {
  key: string;
  providerId: string;
  providerVersion: string;
  checkedAt: number;
  expiresAt: number;
}
interface LimitDoc {
  start: number;
  count: number;
  dayStart: number;
  dayCount: number;
}

const millis = (v: unknown): number =>
  typeof v === 'number' ? v : v && typeof (v as { toMillis?: unknown }).toMillis === 'function' ? (v as { toMillis(): number }).toMillis() : 0;

function parseWords(input: unknown): { word: string; key: string }[] {
  const words = (input as { words?: unknown } | null)?.words;
  if (!Array.isArray(words) || words.length < 1 || words.length > DICT_LIMITS.maxWordsPerRequest) {
    throw new RoomError('TIDAK_SAH', 'invalid-argument', `Hantar 1–${DICT_LIMITS.maxWordsPerRequest} perkataan.`);
  }
  return words.map((w) => {
    const key = typeof w === 'string' ? dictionaryKey(w) : null;
    if (!key) throw new RoomError('TIDAK_SAH', 'invalid-argument', 'Perkataan mesti 2–15 huruf jubin Jawi.');
    return { word: w as string, key };
  });
}

async function consumeRate(ctx: DictCtx, n: number) {
  const ok = await ctx.repo.run(async (tx) => {
    const d = (await tx.get<LimitDoc>(DICT_PATHS.limit(ctx.uid))) ?? { start: ctx.now, count: 0, dayStart: ctx.now, dayCount: 0 };
    if (ctx.now - d.start >= SERVER_RATE.windowMs) Object.assign(d, { start: ctx.now, count: 0 });
    if (ctx.now - d.dayStart >= 24 * 60 * 60 * 1000) Object.assign(d, { dayStart: ctx.now, dayCount: 0 });
    if (d.count + n > SERVER_RATE.max || d.dayCount + n > SERVER_RATE.dailyMax) return false;
    d.count += n;
    d.dayCount += n;
    tx.set(DICT_PATHS.limit(ctx.uid), d);
    return true;
  });
  if (!ok) throw new RoomError('TERLALU_BANYAK_CUBAAN', 'resource-exhausted', 'Terlalu banyak semakan kamus. Tunggu sebentar.');
}

function fromCentral(word: string, d: CentralDoc, now: number): WordCheck {
  const source = { id: d.source.id || CENTRAL_SOURCE_ID, name: d.source.name, version: d.source.version };
  const evidence = { method: 'central-dictionary' as const, checkedAt: now, reviewedBy: d.evidence.reviewedBy, reviewedAt: millis(d.evidence.reviewedAt), note: d.evidence.note, revision: d.revision };
  if (d.status === 'verified') return { word, key: d.key, status: 'VALID', message: messageFor('VALID', { source }), source, evidence, rumi: d.rumi, meaningMs: d.meaningMs };
  const reason = d.reason ? (REJECT_REASONS[d.reason as RejectReason] ?? d.reason) : undefined;
  return { word, key: d.key, status: 'INVALID', message: messageFor('INVALID', { source, reason }), source, evidence, reason };
}

function fromProvider(word: string, key: string, v: ProviderVerdict, info: ProviderInfo, checkedAt: number, cached: boolean): WordCheck {
  const source = { id: info.id, name: info.name, version: info.version, ...(info.licence ? { licence: info.licence } : {}) };
  const evidence = { method: 'provider' as const, checkedAt, ...(v.reference ? { reference: v.reference } : {}) };
  const base = { word, key, cached };
  if (v.status === 'VALID') return { ...base, status: 'VALID', message: messageFor('VALID', { source }), source, evidence, rumi: v.rumi, meaningMs: v.meaningMs };
  if (v.status === 'INVALID') return { ...base, status: 'INVALID', message: messageFor('INVALID', { source, reason: v.reason }), source, evidence, reason: v.reason };
  return { ...base, status: 'NOT_FOUND', message: messageFor('NOT_FOUND', { providerConfigured: info.configured }) };
}

/** Strip undefined (Firestore Admin is configured to ignore them; MemoryRepo keeps JSON). */
const clean = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

export async function validateWordsOnline(ctx: DictCtx, input: unknown): Promise<ValidateResponse> {
  const words = parseWords(input);
  const keys = [...new Set(words.map((w) => w.key))];
  await consumeRate(ctx, keys.length);
  const { provider } = ctx;
  const info = provider.info;

  // One read-only pass: central entries, cached provider verdicts, pending suggestions.
  const snap = await ctx.repo.run(async (tx) => {
    const out = new Map<string, { central: CentralDoc | null; cache: CacheDoc | null; pending: boolean }>();
    for (const key of keys) {
      const central = await tx.get<CentralDoc>(DICT_PATHS.central(key));
      const cache = info.configured ? await tx.get<CacheDoc>(DICT_PATHS.cache(info.id, key)) : null;
      const sug = await tx.get<{ status: string }>(DICT_PATHS.suggestion(key));
      out.set(key, { central, cache, pending: sug?.status === 'pending' });
    }
    return out;
  });

  const results = new Map<string, WordCheck>();
  const toProvider: string[] = [];
  for (const key of keys) {
    const s = snap.get(key)!;
    const word = words.find((w) => w.key === key)!.word;
    if (s.central && (s.central.status === 'verified' || s.central.status === 'rejected')) results.set(key, fromCentral(word, s.central, ctx.now));
    else if (s.cache && s.cache.expiresAt > ctx.now && s.cache.providerVersion === info.version) results.set(key, fromProvider(word, key, s.cache, info, s.cache.checkedAt, true));
    else toProvider.push(key);
  }

  if (toProvider.length) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ctx.providerTimeoutMs ?? DICT_TIMING.providerTimeoutMs);
    let verdicts: Map<string, ProviderVerdict> | null = null;
    try {
      verdicts = await Promise.race([
        provider.lookup(toProvider, ctl.signal),
        new Promise<never>((_, reject) => ctl.signal.addEventListener('abort', () => reject(new Error('provider timeout')), { once: true })),
      ]);
    } catch (e) {
      console.warn('validateJawiWordOnline: provider failed', (e as Error).message);
    } finally {
      clearTimeout(timer);
    }
    for (const key of toProvider) {
      const word = words.find((w) => w.key === key)!.word;
      const v = verdicts?.get(key);
      if (!v) results.set(key, { word, key, status: 'SERVICE_UNAVAILABLE', message: messageFor('SERVICE_UNAVAILABLE') });
      else results.set(key, fromProvider(word, key, v, info, ctx.now, false));
    }
    // Cache real provider verdicts only (not the "no provider" default, not failures).
    if (verdicts && info.configured) {
      await ctx.repo.run(async (tx) => {
        for (const key of toProvider) {
          const v = verdicts.get(key);
          if (!v) continue;
          const ttl = v.status === 'NOT_FOUND' ? DICT_TIMING.serverNotFoundTtlMs : DICT_TIMING.serverPositiveTtlMs;
          tx.set<CacheDoc>(DICT_PATHS.cache(info.id, key), clean({ ...v, key, providerId: info.id, providerVersion: info.version, checkedAt: ctx.now, expiresAt: ctx.now + ttl }));
        }
      });
    }
  }

  // Not found anywhere but a player suggested it: say so.
  for (const key of keys) {
    const r = results.get(key)!;
    if (r.status === 'NOT_FOUND' && snap.get(key)!.pending) results.set(key, { word: r.word, key, status: 'PENDING_REVIEW', message: messageFor('PENDING_REVIEW') });
  }

  return { results: words.map((w) => ({ ...results.get(w.key)!, word: w.word })), provider: info };
}
