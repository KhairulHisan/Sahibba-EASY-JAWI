/**
 * Runs bot moves and hints in a Web Worker; falls back to the main thread
 * if workers are unavailable or the worker fails/times out. Callers get the
 * same results either way (the search is deterministic for a given seed).
 */
import { chooseBotMove, suggestMove, type BotDecision, type MoveCandidate } from '../../engine/bot';
import type { Lexicon } from '../../engine/dictionary';
import { Rng } from '../../engine/rng';
import type { Difficulty, GameState } from '../../engine/types';
import type { BotRequest, BotResponse } from './botProtocol';
import BotWorker from './botWorker?worker&inline';

type RequestBody = BotRequest extends infer R ? (R extends BotRequest ? Omit<R, 'id' | 'lexiconKey'> : never) : never;

const TIMEOUT_MS = 15_000;
let worker: Worker | null = null;
let failures = 0;
const MAX_FAILURES = 3;
let sentKey = '';
let seq = 0;
const pending = new Map<number, { resolve: (r: BotResponse) => void; timer: number }>();

function getWorker(): Worker | null {
  if (failures >= MAX_FAILURES || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new BotWorker();
    worker.onmessage = (ev: MessageEvent<BotResponse>) => {
      const p = pending.get(ev.data.id);
      if (!p) return;
      window.clearTimeout(p.timer);
      pending.delete(ev.data.id);
      p.resolve(ev.data);
    };
    worker.onerror = () => failWorker();
    return worker;
  } catch {
    failures = MAX_FAILURES;
    return null;
  }
}

/** Drop the current worker; a fresh one is created next time (up to MAX_FAILURES). */
function failWorker() {
  failures++;
  worker?.terminate();
  worker = null;
  sentKey = '';
  for (const [id, p] of pending) {
    window.clearTimeout(p.timer);
    p.resolve({ id, ok: false, error: 'worker-failed' });
  }
  pending.clear();
}

async function ask(lexicon: Lexicon, key: string, req: RequestBody): Promise<BotResponse | null> {
  const first = await askOnce(lexicon, key, req);
  if (first && !first.ok && first.error === 'lexicon-not-ready') {
    sentKey = ''; // resend the word list once and retry
    return askOnce(lexicon, key, req);
  }
  return first;
}

function askOnce(lexicon: Lexicon, key: string, req: RequestBody): Promise<BotResponse> | null {
  const w = getWorker();
  if (!w) return null;
  if (sentKey !== key) {
    w.postMessage({ type: 'lexicon', key, entries: lexicon.entries });
    sentKey = key;
  }
  const id = ++seq;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      pending.delete(id);
      failWorker();
      resolve({ id, ok: false, error: 'timeout' });
    }, TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    w.postMessage({ ...req, id, lexiconKey: key } as BotRequest);
  });
}

export async function computeBotMove(state: GameState, playerIndex: number, level: Difficulty, seed: number, lexicon: Lexicon, key: string): Promise<BotDecision> {
  const res = await ask(lexicon, key, { type: 'bot', state, playerIndex, level, seed });
  if (res?.ok && res.decision) return res.decision;
  return chooseBotMove(state, playerIndex, lexicon, level, new Rng(seed));
}

export async function computeHint(state: GameState, playerIndex: number, level: Difficulty, lexicon: Lexicon, key: string): Promise<MoveCandidate | null> {
  const res = await ask(lexicon, key, { type: 'hint', state, playerIndex, level });
  if (res?.ok) return res.hint ?? null;
  return suggestMove(state, playerIndex, lexicon, level);
}
