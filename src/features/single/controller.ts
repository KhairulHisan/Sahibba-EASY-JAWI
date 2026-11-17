/**
 * Single-player controller: the only place UI intents become engine actions.
 * Every action goes through applyAction() with an idempotency key and the
 * expected version, exactly as a multiplayer server would require.
 */
import type { MoveCandidate } from '../../engine/bot';
import { applyAction, evaluatePlay } from '../../engine/game';
import { randomId } from '../../engine/rng';
import type { Lexicon } from '../../engine/dictionary';
import type { ActionDraft, ActionResult, EngineError, GameState } from '../../engine/types';
import type { WordCheck } from '../../dictionary/protocol';
import { useSettings } from '../../state/settings';
import { knownVerified, useDictCache } from '../dictionary/cacheStore';
import { preparePlay, type PreparedPlay } from '../dictionary/preparePlay';
import { ONLINE_DICTIONARY_AVAILABLE, dictionaryChecker } from '../dictionary/service';
import { lexiconFor } from '../../state/lexicon';
import { computeBotMove, computeHint } from './botClient';
import { useHistory, type MatchRecord } from '../../state/history';
import { BOT_ID, HUMAN_ID, HINT_LIMIT, useSingle } from './store';

export function activeLexicon() {
  return lexiconFor(useSingle.getState().packIds);
}

function dispatch(draft: ActionDraft, byHuman: boolean, lexicon: Lexicon = activeLexicon()): ActionResult {
  const { game, commitState } = useSingle.getState();
  if (!game) return { ok: false, error: { code: 'GAME_FINISHED', message: 'Tiada permainan aktif.' } };
  const res = applyAction(game, { ...draft, id: randomId('act-'), expectedVersion: game.version } as Parameters<typeof applyAction>[1], lexicon);
  if (res.ok) {
    commitState(res.state, { event: res.event, byHuman });
    if (res.state.phase === 'finished') recordResult(res.state);
  }
  return res;
}

export function submitPlay(): ActionResult {
  const { draft, setDraft } = useSingle.getState();
  const res = dispatch({ type: 'PLAY', playerId: HUMAN_ID, placements: draft }, true);
  if (res.ok) setDraft([]);
  return res;
}

export type CheckedSubmit =
  | { kind: 'played'; checks: WordCheck[] }
  | { kind: 'rejected'; error: EngineError }
  /** Online check finished but not every word is verified: nothing changed, tiles stay. */
  | { kind: 'blocked'; error: EngineError; checks: WordCheck[] }
  /** Cancelled, or the game/draft changed while checking: nothing applied. */
  | { kind: 'stale' };

/** Smart Online Dictionary switched on and usable in this build (Single Player only). */
export function onlineDictionaryOn(): boolean {
  return ONLINE_DICTIONARY_AVAILABLE && useSettings.getState().smartDictionary;
}

/**
 * SAHKAN with the Smart Online Dictionary. Words missing from the local
 * dictionary are checked online; the move is applied (and scored) only if
 * every formed word is verified by an authoritative source. On anything else
 * the game state, the draft and the turn stay exactly as they were.
 */
export async function submitPlayChecked(opts: { signal?: AbortSignal; fresh?: boolean; onChecking?: (words: string[]) => void } = {}): Promise<CheckedSubmit> {
  const { game, draft } = useSingle.getState();
  if (!game) return { kind: 'rejected', error: { code: 'GAME_FINISHED', message: 'Tiada permainan aktif.' } };
  const humanIdx = game.players.findIndex((p) => p.id === HUMAN_ID);
  const smart = onlineDictionaryOn();
  const version = game.version;
  const draftKey = JSON.stringify(draft);
  let prep: PreparedPlay;
  try {
    prep = await preparePlay({
      game,
      playerIndex: humanIdx,
      placements: draft,
      base: activeLexicon(),
      known: smart ? knownVerified(useDictCache.getState().entries) : [],
      check: smart
        ? (words) => {
            opts.onChecking?.(words);
            return dictionaryChecker().checkWords(words, { signal: opts.signal, fresh: opts.fresh });
          }
        : null,
    });
  } catch {
    return { kind: 'stale' }; // cancelled
  }
  const now = useSingle.getState();
  if (opts.signal?.aborted || now.game?.version !== version || JSON.stringify(now.draft) !== draftKey) return { kind: 'stale' };
  if (prep.kind === 'invalid') return { kind: 'rejected', error: prep.error };
  if (prep.kind === 'blocked') return { kind: 'blocked', error: prep.error, checks: prep.checks };
  const moveIndex = game.moves.length;
  const res = dispatch({ type: 'PLAY', playerId: HUMAN_ID, placements: draft }, true, prep.lexicon);
  if (!res.ok) return { kind: 'rejected', error: res.error };
  now.setDraft([]);
  // Keep the evidence of every online-verified word with the game.
  const online = prep.checks.filter((c) => c.evidence?.method !== 'local');
  if (online.length) useSingle.getState().logOnline(moveIndex, online);
  return { kind: 'played', checks: prep.checks };
}

export function swapTiles(tileIds: string[]): ActionResult {
  useSingle.getState().setDraft([]);
  return dispatch({ type: 'SWAP', playerId: HUMAN_ID, tileIds }, true);
}

export function passTurn(timeout = false): ActionResult {
  useSingle.getState().setDraft([]);
  return dispatch({ type: 'PASS', playerId: HUMAN_ID, ...(timeout ? { reason: 'timeout' as const } : {}) }, true);
}

export function resign(): ActionResult {
  useSingle.getState().setDraft([]);
  return dispatch({ type: 'RESIGN', playerId: HUMAN_ID }, true);
}

/**
 * Compute (in a background worker) and apply the bot's move. Resolves to null
 * if the game moved on meanwhile (version check), so a stale result is never
 * applied. A rejected move falls back to a pass so the game cannot stall.
 */
export async function runBotTurn(expectedVersion: number, isCancelled: () => boolean = () => false): Promise<ActionResult | null> {
  const { game, packIds } = useSingle.getState();
  if (!game || game.phase !== 'active' || game.version !== expectedVersion) return null;
  const idx = game.currentPlayer;
  const bot = game.players[idx];
  if (!bot || bot.kind !== 'bot') return null;
  const seed = (game.rngState ^ Math.imul(game.version + 1, 0x9e3779b1)) >>> 0;
  const decision = await computeBotMove(game, idx, bot.botLevel ?? 'mudah', seed, activeLexicon(), lexiconKey(packIds));
  // Discard the result if the game moved on, or the player paused/left meanwhile.
  if (isCancelled() || useSingle.getState().game?.version !== expectedVersion) return null;
  let res: ActionResult;
  if (decision.type === 'PLAY') res = dispatch({ type: 'PLAY', playerId: BOT_ID, placements: decision.placements }, false);
  else if (decision.type === 'SWAP') res = dispatch({ type: 'SWAP', playerId: BOT_ID, tileIds: decision.tileIds }, false);
  else res = dispatch({ type: 'PASS', playerId: BOT_ID }, false);
  if (!res.ok && res.error.code !== 'STALE_VERSION' && res.error.code !== 'GAME_FINISHED') {
    console.warn('Bot move rejected, passing instead:', res.error);
    res = dispatch({ type: 'PASS', playerId: BOT_ID }, false);
  }
  return res;
}

export function hintsRemaining(): number | null {
  const { game, hintsUsed } = useSingle.getState();
  if (!game) return 0;
  const limit = HINT_LIMIT[game.difficulty];
  return limit === null ? null : Math.max(0, limit - hintsUsed);
}

/** Suggest a move for the human (background worker). Only counts as used if one is found. */
export async function requestHint(isCancelled: () => boolean = () => false): Promise<MoveCandidate | null | 'none-left' | 'stale'> {
  const { game, packIds } = useSingle.getState();
  if (!game) return null;
  if (hintsRemaining() === 0) return 'none-left';
  const humanIdx = game.players.findIndex((p) => p.id === HUMAN_ID);
  const hint = await computeHint(game, humanIdx, game.difficulty, activeLexicon(), lexiconKey(packIds));
  if (isCancelled() || useSingle.getState().game?.version !== game.version) return 'stale';
  if (hint) useSingle.getState().useHint();
  return hint;
}

const lexiconKey = (packIds: readonly string[]) => ['teras', ...[...packIds].sort()].join('|');

export function previewDraft(game: GameState) {
  const { draft } = useSingle.getState();
  if (draft.length === 0) return null;
  const idx = game.players.findIndex((p) => p.id === HUMAN_ID);
  return evaluatePlay(game, idx, draft, activeLexicon());
}

function recordResult(s: GameState) {
  const store = useSingle.getState();
  if (store.recordedResult || !s.result) return;
  let best: MatchRecord['bestWord'];
  for (const m of s.moves) {
    if (m.playerId !== HUMAN_ID) continue;
    for (const w of m.words) if (!best || w.score > best.score) best = { text: w.text, score: w.score };
  }
  const outcome: MatchRecord['outcome'] = s.result.winners.includes(HUMAN_ID) ? (s.result.isTie ? 'seri' : 'menang') : 'kalah';
  useHistory.getState().add({
    id: s.id,
    finishedAt: s.result.finishedAt,
    difficulty: s.difficulty,
    reason: s.result.reason,
    outcome,
    players: s.players.map((p) => ({ name: p.name, score: p.score, isHuman: p.id === HUMAN_ID })),
    bestWord: best,
    wordsPlayed: s.moves.filter((m) => m.playerId === HUMAN_ID && m.type === 'play').length,
    turns: s.turn,
  });
  store.markRecorded();
}
