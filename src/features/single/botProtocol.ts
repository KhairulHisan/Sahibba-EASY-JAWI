import type { BotDecision, MoveCandidate } from '../../engine/bot';
import type { Difficulty, GameState } from '../../engine/types';

export type BotRequest =
  | { type: 'bot'; id: number; lexiconKey: string; state: GameState; playerIndex: number; level: Difficulty; seed: number }
  | { type: 'hint'; id: number; lexiconKey: string; state: GameState; playerIndex: number; level: Difficulty };

export type BotResponse =
  | { id: number; ok: true; decision?: BotDecision; hint?: MoveCandidate | null }
  | { id: number; ok: false; error: string };
