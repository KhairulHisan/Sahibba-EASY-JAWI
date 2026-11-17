import { describe, expect, it } from 'vitest';
import {
  DICT_PATHS,
  HttpJsonProvider,
  NO_PROVIDER,
  misconfiguredProvider,
  parseProviderResponse,
  validateWordsOnline,
  type DictionaryProvider,
  type ProviderVerdict,
} from '../../functions/src/dictionary';
import { MemoryRepo } from '../../functions/src/repo';
import { DICT_TIMING, SERVER_RATE } from '../../src/dictionary/protocol';

const T0 = 1_800_000_000_000;

function fakeProvider(table: Record<string, ProviderVerdict['status']>, opts: { fail?: boolean; delayMs?: number } = {}) {
  const calls: string[][] = [];
  const p: DictionaryProvider = {
    info: { id: 'penyedia-ujian', name: 'Penyedia Berlesen Ujian', version: 'v1', licence: 'Lesen ujian', configured: true },
    lookup: async (keys, signal) => {
      calls.push(keys);
      if (opts.delayMs) await new Promise((r, j) => {
        const t = setTimeout(r, opts.delayMs);
        signal.addEventListener('abort', () => (clearTimeout(t), j(new Error('aborted'))));
      });
      if (opts.fail) throw new Error('down');
      return new Map(keys.map((k) => [k, { status: table[k] ?? 'NOT_FOUND', reference: `ref:${k}` }]));
    },
  };
  return { p, calls };
}

function centralDoc(key: string, status: 'verified' | 'rejected', reason?: string) {
  return { key, word: key, status, reason, source: { id: 'kamus-pusat', name: 'Kamus Dewan', version: 'Ed. 4' }, evidence: { method: 'admin-review', reviewedBy: 'admin-1', reviewedAt: T0 - 1, note: 'hlm. 77' }, revision: 2 };
}

const ctx = (repo: MemoryRepo, provider: DictionaryProvider, now = T0, uid = 'u1') => ({ repo, uid, now, provider, providerTimeoutMs: 50 });

describe('validateJawiWordOnline (server logic)', () => {
  it('no provider configured: central dictionary answers, the rest is NOT_FOUND or PENDING_REVIEW', async () => {
    const repo = new MemoryRepo();
    repo.docs.set(DICT_PATHS.central('سب'), centralDoc('سب', 'verified'));
    repo.docs.set(DICT_PATHS.central('سس'), centralDoc('سس', 'rejected', 'ejaan-salah'));
    repo.docs.set(DICT_PATHS.suggestion('بب'), { key: 'بب', status: 'pending', count: 2 });
    const res = await validateWordsOnline(ctx(repo, NO_PROVIDER), { words: ['سب', 'سس', 'دد', 'بب'] });
    expect(res.provider.configured).toBe(false);
    expect(res.results.map((r) => r.status)).toEqual(['VALID', 'INVALID', 'NOT_FOUND', 'PENDING_REVIEW']);
    expect(res.results[0]).toMatchObject({ source: { name: 'Kamus Dewan', version: 'Ed. 4' }, evidence: { method: 'central-dictionary', reviewedBy: 'admin-1', note: 'hlm. 77', revision: 2 } });
    expect(res.results[1]!.reason).toBe('Ejaan salah');
    expect(res.results[2]!.message).toContain('tidak bermaksud ejaan salah');
    // "No provider" verdicts are never cached as if a provider had answered.
    expect([...repo.docs.keys()].some((k) => k.startsWith('dictionaryCache/'))).toBe(false);
  });

  it('licensed provider: verdicts carry source + version + reference and are cached on the server', async () => {
    const repo = new MemoryRepo();
    const { p, calls } = fakeProvider({ تت: 'VALID', تب: 'INVALID' });
    const first = await validateWordsOnline(ctx(repo, p), { words: ['تت', 'تب', 'دد'] });
    expect(first.results.map((r) => r.status)).toEqual(['VALID', 'INVALID', 'NOT_FOUND']);
    expect(first.results[0]).toMatchObject({ source: { id: 'penyedia-ujian', name: 'Penyedia Berlesen Ujian', version: 'v1', licence: 'Lesen ujian' }, evidence: { method: 'provider', reference: 'ref:تت' } });
    const cacheDoc = repo.docs.get(DICT_PATHS.cache('penyedia-ujian', 'تت')) as { expiresAt: number; providerVersion: string };
    expect(cacheDoc).toMatchObject({ providerVersion: 'v1', expiresAt: T0 + DICT_TIMING.serverPositiveTtlMs });
    const second = await validateWordsOnline(ctx(repo, p, T0 + 1000), { words: ['تت'] });
    expect(second.results[0]).toMatchObject({ status: 'VALID', cached: true });
    expect(calls).toHaveLength(1);
  });

  it('central dictionary wins over the provider (admin decision is final)', async () => {
    const repo = new MemoryRepo();
    repo.docs.set(DICT_PATHS.central('تت'), centralDoc('تت', 'rejected', 'tidak-sesuai'));
    const { p, calls } = fakeProvider({ تت: 'VALID' });
    const res = await validateWordsOnline(ctx(repo, p), { words: ['تت'] });
    expect(res.results[0]!.status).toBe('INVALID');
    expect(calls).toHaveLength(0);
  });

  it('provider outage or timeout → SERVICE_UNAVAILABLE, nothing cached', async () => {
    for (const opts of [{ fail: true }, { delayMs: 500 }]) {
      const repo = new MemoryRepo();
      const { p } = fakeProvider({ تت: 'VALID' }, opts);
      const res = await validateWordsOnline(ctx(repo, p), { words: ['تت'] });
      expect(res.results[0]!.status).toBe('SERVICE_UNAVAILABLE');
      expect([...repo.docs.keys()].some((k) => k.startsWith('dictionaryCache/'))).toBe(false);
    }
    const res = await validateWordsOnline(ctx(new MemoryRepo(), misconfiguredProvider('test')), { words: ['تت'] });
    expect(res.results[0]!.status).toBe('SERVICE_UNAVAILABLE');
  });

  it('normalises input the same way as the client and rejects bad input', async () => {
    const repo = new MemoryRepo();
    repo.docs.set(DICT_PATHS.central('کتا'), centralDoc('کتا', 'verified'));
    const res = await validateWordsOnline(ctx(repo, NO_PROVIDER), { words: ['كتا'] }); // Arabic kaf folded
    expect(res.results[0]).toMatchObject({ key: 'کتا', status: 'VALID', word: 'كتا' });
    for (const bad of [{}, { words: [] }, { words: ['buku'] }, { words: Array(9).fill('بب') }, { words: [42] }]) {
      await expect(validateWordsOnline(ctx(repo, NO_PROVIDER), bad)).rejects.toMatchObject({ reason: 'TIDAK_SAH' });
    }
  });

  it('rate-limits each user (window and daily caps)', async () => {
    const repo = new MemoryRepo();
    let now = T0;
    const words = Array.from({ length: 6 }, (_, i) => 'ب' + 'تثجچحخ'[i]!);
    for (let i = 0; i < SERVER_RATE.max / 6; i++) await validateWordsOnline(ctx(repo, NO_PROVIDER, now), { words });
    await expect(validateWordsOnline(ctx(repo, NO_PROVIDER, now), { words: ['بب'] })).rejects.toMatchObject({ reason: 'TERLALU_BANYAK_CUBAAN' });
    // Another user is unaffected; the same user may continue after the window.
    await validateWordsOnline(ctx(repo, NO_PROVIDER, now, 'u2'), { words: ['بب'] });
    now += SERVER_RATE.windowMs + 1;
    await validateWordsOnline(ctx(repo, NO_PROVIDER, now), { words: ['بب'] });
  });

  it('concurrent requests are all answered; the provider result is consistent', async () => {
    const repo = new MemoryRepo();
    const { p } = fakeProvider({ تت: 'VALID' });
    const all = await Promise.all(Array.from({ length: 5 }, (_, i) => validateWordsOnline(ctx(repo, p, T0, `u${i}`), { words: ['تت'] })));
    expect(all.every((r) => r.results[0]!.status === 'VALID')).toBe(true);
  });
});

describe('HttpJsonProvider (generic licensed-provider adapter)', () => {
  it('sends the key only in the server-side request and parses a strict answer', async () => {
    let seen: { url: string; auth: string | null; body: string } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, auth: new Headers(init.headers).get('authorization'), body: String(init.body) };
      return new Response(JSON.stringify({ results: [{ word: 'تت', status: 'VALID', reference: 'E-1' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const p = new HttpJsonProvider({ id: 'lesen', name: 'Penyedia', version: '2026', url: 'https://example.invalid/semak', apiKey: () => 'rahsia' }, fetchImpl);
    const m = await p.lookup(['تت'], new AbortController().signal);
    expect(m.get('تت')).toMatchObject({ status: 'VALID', reference: 'E-1' });
    expect(seen).toEqual({ url: 'https://example.invalid/semak', auth: 'Bearer rahsia', body: JSON.stringify({ words: ['تت'] }) });
  });

  it('never treats a malformed, partial or failed answer as VALID', async () => {
    expect(() => parseProviderResponse({}, ['تت'])).toThrow();
    expect(() => parseProviderResponse({ results: [{ word: 'تت', status: 'MAYBE' }] }, ['تت'])).toThrow();
    expect(() => parseProviderResponse({ results: [{ word: 'تت', status: 'VALID' }] }, ['تت', 'تب'])).toThrow();
    const http500 = new HttpJsonProvider({ id: 'x', name: 'x', version: '1', url: 'https://example.invalid', apiKey: () => 'k' }, (async () => new Response('err', { status: 500 })) as unknown as typeof fetch);
    await expect(http500.lookup(['تت'], new AbortController().signal)).rejects.toThrow('HTTP 500');
  });
});
