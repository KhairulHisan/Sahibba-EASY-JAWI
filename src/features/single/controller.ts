/**
 * Single-player controller: the only place UI intents become engine actions.
 * Every action goes through applyAction() with an idempotency key and the
 * expected version, exactly as a multiplayer server would require.
 */
import { chooseBotMove, suggestMove, type MoveCandidate } from '../../engine/bot';
import { applyAction, evaluatePlay } from '../../engine/game';
import { randomId, Rng } from '../../engine/rng';
import type { ActionDraft, ActionResult, GameState } from '../../engine/types';
import { lexiconFor } from '../../state/lexicon';
import { useHistory, type MatchRecord } from '../../state/history';
import { BOT_ID, HUMAN_ID, HINT_LIMIT, useSingle } from './store';

export function activeLexicon() {
  return lexiconFor(useSingle.getState().packIds);
}

function dispatch(draft: ActionDraft, byHuman: boolean): ActionResult {
  const { game, commitState } = useSingle.getState();
  if (!game) return { ok: false, error: { code: 'GAME_FINISHED', message: 'Tiada permainan aktif.' } };
  const res = applyAction(game, { ...draft, id: randomId('act-'), expectedVersion: game.version } as Parameters<typeof applyAction>[1], activeLexicon());
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

/** Compute and apply the bot's move for the current state. */
export function runBotTurn(expectedVersion: number): ActionResult | null {
  const { game } = useSingle.getState();
  if (!game || game.phase !== 'active' || game.version !== expectedVersion) return null;
  const idx = game.currentPlayer;
  const bot = game.players[idx];
  if (!bot || bot.kind !== 'bot') return null;
  const rng = new Rng((game.rngState ^ Math.imul(game.version + 1, 0x9e3779b1)) >>> 0);
  const decision = chooseBotMove(game, idx, activeLexicon(), bot.botLevel ?? 'mudah', rng);
  if (decision.type === 'PLAY') return dispatch({ type: 'PLAY', playerId: BOT_ID, placements: decision.placements }, false);
  if (decision.type === 'SWAP') return dispatch({ type: 'SWAP', playerId: BOT_ID, tileIds: decision.tileIds }, false);
  return dispatch({ type: 'PASS', playerId: BOT_ID }, false);
}

export function hintsRemaining(): number | null {
  const { game, hintsUsed } = useSingle.getState();
  if (!game) return 0;
  const limit = HINT_LIMIT[game.difficulty];
  return limit === null ? null : Math.max(0, limit - hintsUsed);
}

export function requestHint(): MoveCandidate | null | 'none-left' {
  const { game, useHint } = useSingle.getState();
  if (!game) return null;
  const left = hintsRemaining();
  if (left === 0) return 'none-left';
  const humanIdx = game.players.findIndex((p) => p.id === HUMAN_ID);
  const hint = suggestMove(game, humanIdx, activeLexicon(), game.difficulty);
  if (hint) useHint();
  return hint;
}

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
