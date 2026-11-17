import { describe, expect, it } from 'vitest';
import { applyAction } from '../../src/engine/game';
import type { GameAction, GameState, Placement, Tile } from '../../src/engine/types';
import { dictionaryKey, isAcceptable, type ValidateResponse, type WordCheck } from '../../src/dictionary/protocol';
import { createChecker, type CentralEntry, type CheckCache, type DictionaryBackend } from '../../src/features/dictionary/checker';
import { preparePlay } from '../../src/features/dictionary/preparePlay';
import { aid, lexiconOf, makeState, tile } from './helpers';

// ---- fakes -------------------------------------------------------------------------

function memoryCache(): CheckCache & { map: Map<string, WordCheck> } {
  const map = new Map<string, WordCheck>();
  return { map, get: (k) => map.get(k) ?? null, put: (c) => void map.set(c.key, c) };
}

function central(key: string, status: 'verified' | 'rejected' = 'verified', reason?: string): CentralEntry {
  return {
    key,
    status,
    reason,
    source: { id: 'kamus-pusat', name: 'Kamus Dewan Edisi Keempat', version: 'Ed. 4 (2005)' },
    evidence: { reviewedBy: 'admin-1', reviewedAt: 1, note: 'hlm. 123' },
    revision: 1,
  };
}

function backend(opts: {
  central?: Record<string, CentralEntry>;
  pending?: string[];
  fn?: (keys: string[]) => Promise<ValidateResponse>;
  delayMs?: number;
  fail?: boolean;
}) {
  const calls = { central: [] as string[], pending: [] as string[], fn: [] as string[][] };
  const wait = () => new Promise((r) => setTimeout(r, opts.delayMs ?? 0));
  const b: DictionaryBackend = {
    getCentral: async (k) => {
      calls.central.push(k);
      await wait();
      if (opts.fail) throw new Error('network');
      return opts.central?.[k] ?? null;
    },
    isPending: async (k) => {
      calls.pending.push(k);
      return opts.pending?.includes(k) ?? false;
    },
    ...(opts.fn
      ? {
          validateOnline: async (keys: string[]) => {
            calls.fn.push(keys);
            return opts.fn!(keys);
          },
        }
      : {}),
  };
  return { b, calls };
}

const providerValid = (keys: string[]): Promise<ValidateResponse> =>
  Promise.resolve({
    provider: { id: 'p', name: 'Penyedia Ujian', version: '1', configured: true },
    results: keys.map((key) => ({
      word: key,
      key,
      status: 'VALID' as const,
      message: 'ok',
      source: { id: 'p', name: 'Penyedia Ujian', version: '1' },
      evidence: { method: 'provider' as const, checkedAt: 1, reference: `ref-${key}` },
    })),
  });

const noLocal = () => false;

// ---- normalisation -----------------------------------------------------------------

describe('dictionaryKey (project Jawi normalisation)', () => {
  it('folds variant letters, strips harakat/tatweel/invisible marks and keeps hamza', () => {
    expect(dictionaryKey('كاتق')).toBe('کاتق'); // Arabic kaf → keheh
    expect(dictionaryKey('بُوكُو')).toBe('بوکو'); // harakat stripped
    expect(dictionaryKey('بـوکو')).toBe('بوکو'); // tatweel
    expect(dictionaryKey('ب‌وکو')).toBe('بوکو'); // ZWNJ
    expect(dictionaryKey('جزء')).toBe('جزء'); // hamzah is its own letter, never dropped
    expect(dictionaryKey('ﺑﻮﻛﻮ')).toBe('بوکو'); // presentation forms
  });

  it('rejects anything that is not a single word of tile letters', () => {
    for (const bad of ['', 'ب', 'buku', 'بوکو باتو', 'بوکو1', 'پاکو', 'سؤال' /* ؤ is not a tile letter */, 'ب'.repeat(16)]) expect(dictionaryKey(bad)).toBeNull();
  });
});

// ---- checker -------------------------------------------------------------------------

describe('online dictionary checker', () => {
  it('local dictionary first: no network at all', async () => {
    const { b, calls } = backend({});
    const c = createChecker({ backend: b, cache: memoryCache(), isLocal: (k) => k === 'بوکو' });
    const [r] = await c.checkWords(['بوکو']);
    expect(r).toMatchObject({ status: 'VALID', evidence: { method: 'local' } });
    expect(calls.central).toEqual([]);
  });

  it('central dictionary: verified → VALID with source + evidence (cached); rejected → INVALID', async () => {
    const cache = memoryCache();
    const { b, calls } = backend({ central: { سب: central('سب'), سس: central('سس', 'rejected', 'ejaan-salah') } });
    const c = createChecker({ backend: b, cache, isLocal: noLocal });
    const [ok, bad] = await c.checkWords(['سب', 'سس']);
    expect(ok).toMatchObject({ status: 'VALID', source: { name: 'Kamus Dewan Edisi Keempat', version: 'Ed. 4 (2005)' }, evidence: { method: 'central-dictionary', reviewedBy: 'admin-1', note: 'hlm. 123', revision: 1 } });
    expect(isAcceptable(ok!)).toBe(true);
    expect(bad).toMatchObject({ status: 'INVALID', reason: 'Ejaan salah' });
    expect(isAcceptable(bad!)).toBe(false);
    // Second check comes from the device cache.
    const [again] = await c.checkWords(['سب']);
    expect(again).toMatchObject({ status: 'VALID', cached: true });
    expect(calls.central).toEqual(['سب', 'سس']);
  });

  it('not found without a provider → NOT_FOUND (never INVALID); a pending suggestion → PENDING_REVIEW', async () => {
    const { b } = backend({ pending: ['بب'] });
    const c = createChecker({ backend: b, cache: memoryCache(), isLocal: noLocal });
    const [nf, pend] = await c.checkWords(['دد', 'بب']);
    expect(nf!.status).toBe('NOT_FOUND');
    expect(nf!.message).toContain('tidak bermaksud ejaan salah');
    expect(pend!.status).toBe('PENDING_REVIEW');
    expect(isAcceptable(nf!) || isAcceptable(pend!)).toBe(false);
  });

  it('licensed provider via the Cloud Function after the central dictionary misses', async () => {
    const { b, calls } = backend({ fn: providerValid });
    const c = createChecker({ backend: b, cache: memoryCache(), isLocal: noLocal });
    const [r] = await c.checkWords(['تت']);
    expect(r).toMatchObject({ status: 'VALID', evidence: { method: 'provider', reference: 'ref-تت' } });
    expect(calls.fn).toEqual([['تت']]);
    expect(calls.pending).toEqual([]); // the function reports pending suggestions itself
  });

  it('network failure, timeouts and offline give SERVICE_UNAVAILABLE — never a verdict', async () => {
    const failing = createChecker({ backend: backend({ fail: true }).b, cache: memoryCache(), isLocal: noLocal });
    expect((await failing.checkWords(['سب']))[0]!.status).toBe('SERVICE_UNAVAILABLE');

    const slow = createChecker({ backend: backend({ delayMs: 200 }).b, cache: memoryCache(), isLocal: noLocal, timeouts: { firestoreTimeoutMs: 20 } });
    expect((await slow.checkWords(['سب']))[0]!.status).toBe('SERVICE_UNAVAILABLE');

    const fnDown = createChecker({ backend: backend({ fn: () => Promise.reject(new Error('functions/unavailable')) }).b, cache: memoryCache(), isLocal: noLocal });
    expect((await fnDown.checkWords(['سب']))[0]!.status).toBe('SERVICE_UNAVAILABLE');

    const { b, calls } = backend({});
    const offline = createChecker({ backend: b, cache: memoryCache(), isLocal: noLocal, online: () => false });
    const [r] = await offline.checkWords(['سب']);
    expect(r!.status).toBe('SERVICE_UNAVAILABLE');
    expect(calls.central).toEqual([]);
  });

  it('SERVICE_UNAVAILABLE is not remembered: a retry looks up again and can succeed', async () => {
    let up = false;
    const b: DictionaryBackend = {
      getCentral: async (k) => {
        if (!up) throw new Error('offline');
        return central(k);
      },
      isPending: async () => false,
    };
    const c = createChecker({ backend: b, cache: memoryCache(), isLocal: noLocal });
    expect((await c.checkWords(['سب']))[0]!.status).toBe('SERVICE_UNAVAILABLE');
    up = true;
    expect((await c.checkWords(['سب']))[0]!.status).toBe('VALID');
  });

  it('concurrent checks of the same word share one lookup', async () => {
    const { b, calls } = backend({ central: { سب: central('سب') }, delayMs: 30 });
    const c = createChecker({ backend: b, cache: memoryCache(), isLocal: noLocal });
    const results = await Promise.all([c.checkWords(['سب']), c.checkWords(['سب', 'سب']), c.checkWords(['سب'])]);
    expect(results.flat().every((r) => r.status === 'VALID')).toBe(true);
    expect(calls.central).toEqual(['سب']);
  });

  it('NOT_FOUND is remembered briefly; "Cuba lagi" (fresh) asks again; markPending shows PENDING at once', async () => {
    const { b, calls } = backend({});
    const c = createChecker({ backend: b, cache: memoryCache(), isLocal: noLocal });
    await c.checkWords(['دد']);
    await c.checkWords(['دد']);
    expect(calls.central).toEqual(['دد']);
    await c.checkWords(['دد'], { fresh: true });
    expect(calls.central).toEqual(['دد', 'دد']);
    c.markPending('دد', 'دد');
    expect((await c.checkWords(['دد']))[0]!.status).toBe('PENDING_REVIEW');
  });

  it('device-side rate limit stops floods of lookups', async () => {
    const { b, calls } = backend({});
    const c = createChecker({ backend: b, cache: memoryCache(), isLocal: noLocal, rate: { max: 2, windowMs: 60_000 } });
    await c.checkWords(['دد', 'بب']);
    const [r] = await c.checkWords(['تت']);
    expect(r!.status).toBe('SERVICE_UNAVAILABLE');
    expect(r!.message).toContain('Had semakan');
    expect(calls.central).toHaveLength(2);
  });

  it('abort (Batal) rejects the caller but the lookup still completes for the cache', async () => {
    const cache = memoryCache();
    const { b } = backend({ central: { سب: central('سب') }, delayMs: 30 });
    const c = createChecker({ backend: b, cache, isLocal: noLocal });
    const ctl = new AbortController();
    const p = c.checkWords(['سب'], { signal: ctl.signal });
    ctl.abort();
    await expect(p).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.map.get('سب')?.status).toBe('VALID');
  });
});

// ---- score protection ----------------------------------------------------------------

/** Board: vertical "بس" at x=6 (rows 6–7). Player 2 then plays vertical "دا" at x=5,
 *  which also forms the cross-words "بد" (row 6) and "سا" (row 7), read right→left. */
function crossWordSetup() {
  const lex = lexiconOf(['بس', 'bas'], ['دا', 'da']);
  const r1 = [tile('ب', 3), tile('س', 2)];
  const r2: Tile[] = [tile('د', 4), tile('ا', 1)];
  let s: GameState = makeState([r1, r2]);
  const first = applyAction(s, { type: 'PLAY', playerId: 'p1', placements: [{ tileId: r1[0]!.id, x: 6, y: 6 }, { tileId: r1[1]!.id, x: 6, y: 7 }], id: aid(), expectedVersion: 0 } as GameAction, lex);
  if (!first.ok) throw new Error(first.error.message);
  s = first.state;
  const placements: Placement[] = [
    { tileId: r2[0]!.id, x: 5, y: 6 },
    { tileId: r2[1]!.id, x: 5, y: 7 },
  ];
  return { lex, s, placements };
}

const verdict = (key: string, status: WordCheck['status']): WordCheck =>
  status === 'VALID'
    ? { word: key, key, status, message: '', source: { id: 'kamus-pusat', name: 'Kamus Dewan', version: '4' }, evidence: { method: 'central-dictionary', checkedAt: 1, reviewedBy: 'admin', note: 'hlm. 9' } }
    : { word: key, key, status, message: '' };

describe('score protection (preparePlay)', () => {
  it('checks exactly the unknown words, including cross-words, and scores only when all are verified', async () => {
    const { lex, s, placements } = crossWordSetup();
    let asked: string[] = [];
    const prep = await preparePlay({
      game: s,
      playerIndex: 1,
      placements,
      base: lex,
      known: [],
      check: async (words) => {
        asked = words;
        return words.map((w) => verdict(w, 'VALID'));
      },
    });
    expect([...asked].sort()).toEqual(['بد', 'سا']); // main word "دا" is local; both cross-words checked
    expect(prep.kind).toBe('ready');
    if (prep.kind !== 'ready') return;
    const res = applyAction(s, { type: 'PLAY', playerId: 'p2', placements, id: aid(), expectedVersion: s.version } as GameAction, prep.lexicon);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.event.kind === 'play' && res.event.words.map((w) => w.text).sort()).toEqual(['بد', 'دا', 'سا']);
      expect(res.state.players[1]!.score).toBeGreaterThan(0);
    }
    // The local lexicon alone still rejects the move: the online verdicts are what made it legal.
    expect(applyAction(s, { type: 'PLAY', playerId: 'p2', placements, id: aid(), expectedVersion: s.version } as GameAction, lex).ok).toBe(false);
  });

  for (const status of ['NOT_FOUND', 'PENDING_REVIEW', 'INVALID', 'SERVICE_UNAVAILABLE'] as const) {
    it(`one cross-word ${status} → move blocked, nothing scored, tiles and turn kept`, async () => {
      const { lex, s, placements } = crossWordSetup();
      const before = JSON.stringify(s);
      const prep = await preparePlay({
        game: s,
        playerIndex: 1,
        placements,
        base: lex,
        known: [],
        check: async (words) => words.map((w) => verdict(w, w === 'سا' ? status : 'VALID')),
      });
      expect(prep.kind).toBe('blocked');
      if (prep.kind === 'blocked') expect(prep.checks.find((c) => c.key === 'سا')!.status).toBe(status);
      expect(JSON.stringify(s)).toBe(before); // state untouched: score, rack, turn
    });
  }

  it('forged or incomplete VALID verdicts are not accepted', async () => {
    const { lex, s, placements } = crossWordSetup();
    const forged: WordCheck[] = [
      { word: 'بد', key: 'بد', status: 'VALID', message: '' }, // no source / evidence
      { word: 'سا', key: 'سا', status: 'VALID', message: '', source: { id: 'x', name: 'x', version: '1' }, evidence: { method: 'none', checkedAt: 1 } },
    ];
    const prep = await preparePlay({ game: s, playerIndex: 1, placements, base: lex, known: forged, check: async () => forged });
    expect(prep.kind).toBe('blocked');
    const noReviewer = { ...verdict('بد', 'VALID'), evidence: { method: 'central-dictionary' as const, checkedAt: 1 } };
    expect(isAcceptable(noReviewer)).toBe(false);
  });

  it('with the online dictionary OFF, unknown words are rejected locally and nothing is looked up', async () => {
    const { lex, s, placements } = crossWordSetup();
    const prep = await preparePlay({ game: s, playerIndex: 1, placements, base: lex, known: [verdict('بد', 'VALID'), verdict('سا', 'VALID')], check: null });
    expect(prep).toMatchObject({ kind: 'invalid', error: { code: 'UNKNOWN_WORD' } });
  });

  it('cached verified words are accepted without a new lookup; placement errors never reach the dictionary', async () => {
    const { lex, s, placements } = crossWordSetup();
    let calls = 0;
    const check = async (w: string[]) => {
      calls++;
      return w.map((x) => verdict(x, 'VALID'));
    };
    const prep = await preparePlay({ game: s, playerIndex: 1, placements, base: lex, known: [verdict('بد', 'VALID'), verdict('سا', 'VALID')], check });
    expect(prep.kind).toBe('ready');
    expect(calls).toBe(0);
    const far = [{ tileId: placements[0]!.tileId, x: 0, y: 0 }];
    const bad = await preparePlay({ game: s, playerIndex: 1, placements: far, base: lex, known: [], check });
    expect(bad.kind).toBe('invalid');
    expect(calls).toBe(0);
  });

  it('the move is applied exactly once even if submitted twice (idempotency + version guard)', async () => {
    const { lex, s, placements } = crossWordSetup();
    const prep = await preparePlay({ game: s, playerIndex: 1, placements, base: lex, known: [verdict('بد', 'VALID'), verdict('سا', 'VALID')], check: async (w) => w.map((x) => verdict(x, 'VALID')) });
    if (prep.kind !== 'ready') throw new Error('expected ready');
    const action = { type: 'PLAY', playerId: 'p2', placements, id: 'same-id', expectedVersion: s.version } as GameAction;
    const once = applyAction(s, action, prep.lexicon);
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    const twice = applyAction(once.state, action, prep.lexicon);
    expect(twice.ok).toBe(false);
    const stale = applyAction(once.state, { ...action, id: 'other-id' }, prep.lexicon);
    expect(stale.ok).toBe(false);
  });
});
