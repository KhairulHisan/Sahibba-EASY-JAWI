/**
 * Score protection for Single Player with the Smart Online Dictionary.
 *
 * The engine scores a move only if EVERY formed word (main + cross words) is
 * in the lexicon it is given. This module decides which lexicon that is:
 * the local lexicon plus ONLY words an authoritative source verified
 * (isAcceptable). NOT_FOUND, PENDING_REVIEW, INVALID and SERVICE_UNAVAILABLE
 * never enter it, so they can never be scored. Pure: no I/O of its own.
 */
import type { Lexicon, LexiconEntry } from '../../engine/dictionary';
import { evaluatePlay } from '../../engine/game';
import type { EngineError, GameState, Placement } from '../../engine/types';
import { isAcceptable, type WordCheck } from '../../dictionary/protocol';

export type PreparedPlay =
  /** Every word is accepted: apply the move with this lexicon. */
  | { kind: 'ready'; lexicon: Lexicon; checks: WordCheck[] }
  /** Some words were checked online and not (yet) accepted. Nothing changes; tiles stay. */
  | { kind: 'blocked'; error: EngineError; checks: WordCheck[] }
  /** Not a dictionary question (placement rule, or online check is off). */
  | { kind: 'invalid'; error: EngineError };

/** A verified online word as a lexicon entry (shown in Kamus / word details too). */
export function entryFromCheck(c: WordCheck): LexiconEntry {
  return {
    id: `online-${c.key}`,
    jawi: c.key,
    rumi: c.rumi ?? '',
    meaningMs: c.meaningMs || 'Disahkan dalam talian.',
    category: 'umum',
    difficulty: 3,
    approved: true,
    sourceNote: `${c.source!.name} (${c.source!.version})${c.evidence?.note ? ` — ${c.evidence.note}` : ''}`,
    pack: 'online',
  };
}

export function lexiconWithOnline(base: Lexicon, checks: readonly WordCheck[]): Lexicon {
  const extra = checks.filter((c) => isAcceptable(c) && c.evidence!.method !== 'local' && !base.has(c.key)).map(entryFromCheck);
  return extra.length ? base.withExtra(extra) : base;
}

export async function preparePlay(args: {
  game: GameState;
  playerIndex: number;
  placements: readonly Placement[];
  /** Local lexicon (core + teacher packs). */
  base: Lexicon;
  /** Previously cached authoritative verdicts (already-verified words). */
  known: readonly WordCheck[];
  /** null = Smart Online Dictionary is off. */
  check: ((words: string[]) => Promise<WordCheck[]>) | null;
}): Promise<PreparedPlay> {
  const { game, playerIndex, placements, base, known, check } = args;
  const lex = check ? lexiconWithOnline(base, known) : base;
  const first = evaluatePlay(game, playerIndex, placements, lex);
  if (first.ok) return { kind: 'ready', lexicon: lex, checks: [] };
  if (first.error.code !== 'UNKNOWN_WORD' || !check) return { kind: 'invalid', error: first.error };

  const words = first.error.words ?? [];
  const checks = await check(words);
  if (!checks.every(isAcceptable)) return { kind: 'blocked', error: first.error, checks };

  // Re-evaluate from scratch with the newly verified words: the engine (not this
  // module) still decides placement legality and the score.
  const lex2 = lexiconWithOnline(lex, checks);
  const second = evaluatePlay(game, playerIndex, placements, lex2);
  if (!second.ok) return { kind: 'invalid', error: second.error };
  return { kind: 'ready', lexicon: lex2, checks };
}
