import type { PublicPlayer } from '../../multiplayer/protocol';

const TONES = ['navy', 'jade', 'mango', 'coral'] as const;

/** One colour per player for the whole room (by join order, not turn order). */
export function playerTone(players: readonly PublicPlayer[], uid: string): (typeof TONES)[number] {
  const rank = [...players].sort((a, b) => a.joinedAt - b.joinedAt || a.uid.localeCompare(b.uid)).findIndex((p) => p.uid === uid);
  return TONES[Math.max(0, rank) % 4]!;
}
