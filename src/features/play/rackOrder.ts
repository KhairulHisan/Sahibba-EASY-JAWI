import type { Tile } from '../../engine/types';

/** Keep the player's chosen rack order; drop used ids and append new ones. */
export function syncOrder(rack: readonly Tile[], order: readonly string[]): string[] {
  const ids = new Set(rack.map((t) => t.id));
  const kept = order.filter((id) => ids.has(id));
  const added = rack.map((t) => t.id).filter((id) => !kept.includes(id));
  return [...kept, ...added];
}

export function orderedRack(rack: readonly Tile[], order: readonly string[]): Tile[] {
  const byId = new Map(rack.map((t) => [t.id, t]));
  return syncOrder(rack, order).map((id) => byId.get(id)!);
}
