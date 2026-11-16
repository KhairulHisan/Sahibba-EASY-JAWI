/// <reference lib="webworker" />
/**
 * Background thread for the expensive dictionary search (bot moves and
 * hints), so the UI never freezes on slow phones. Imports engine modules
 * only; the lexicon entries are sent in once per word-pack combination.
 */
import { chooseBotMove, suggestMove } from '../../engine/bot';
import { Lexicon, type LexiconEntry } from '../../engine/dictionary';
import { Rng } from '../../engine/rng';
import type { BotRequest, BotResponse } from './botProtocol';

let lexicon: Lexicon | null = null;
let lexiconKey = '';

self.onmessage = (ev: MessageEvent<BotRequest | { type: 'lexicon'; key: string; entries: LexiconEntry[] }>) => {
  const msg = ev.data;
  if (msg.type === 'lexicon') {
    try {
      lexicon = new Lexicon(msg.entries);
      lexiconKey = msg.key;
    } catch {
      lexicon = null;
      lexiconKey = '';
    }
    return;
  }
  const reply = (r: BotResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(r);
  try {
    if (!lexicon || lexiconKey !== msg.lexiconKey) throw new Error('lexicon-not-ready');
    if (msg.type === 'bot') {
      const decision = chooseBotMove(msg.state, msg.playerIndex, lexicon, msg.level, new Rng(msg.seed));
      reply({ id: msg.id, ok: true, decision });
    } else {
      reply({ id: msg.id, ok: true, hint: suggestMove(msg.state, msg.playerIndex, lexicon, msg.level) });
    }
  } catch (e) {
    reply({ id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
