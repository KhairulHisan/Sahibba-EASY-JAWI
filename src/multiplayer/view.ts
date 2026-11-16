import { TILE_DISTRIBUTION } from '../data';
import { idx, inBounds, type BoardCells } from '../engine/board';
import { createGame } from '../engine/game';
import type { GameState, Tile } from '../engine/types';
import type { RoomDoc } from './protocol';

/**
 * Rebuild what one client may know as an engine GameState: the public board
 * plus its OWN rack (other racks empty). Used for live move preview and hints
 * — the server re-validates everything.
 */
export function localGameView(room: RoomDoc, myRack: Tile[], uid: string): GameState | null {
  if (!room.game) return null;
  const g = createGame({
    id: 'view',
    players: room.players.map((p) => ({ id: p.uid, name: p.nickname, kind: 'human' as const })),
    difficulty: room.settings.difficulty,
    distribution: TILE_DISTRIBUTION,
    seed: 1,
    rules: room.game.rules,
  });
  g.board = room.game.board;
  g.version = room.game.version;
  g.bag = [];
  g.turn = room.game.turn;
  g.players.forEach((p) => {
    const pub = room.players.find((x) => x.uid === p.id)!;
    p.rack = p.id === uid ? myRack : [];
    p.score = pub.score;
    p.resigned = pub.resigned;
  });
  g.currentPlayer = Math.max(0, g.players.findIndex((p) => p.id === room.game!.currentUid));
  g.phase = room.status === 'bermain' ? 'active' : 'finished';
  return g;
}

/** Horizontal (read right→left) and vertical (top→bottom) words through a cell. */
export function wordsThrough(board: BoardCells, size: number, x: number, y: number): string[] {
  const has = (cx: number, cy: number) => inBounds(size, cx, cy) && board[idx(size, cx, cy)] !== null;
  const out: string[] = [];
  let sx = x;
  while (has(sx + 1, y)) sx++;
  let h = '';
  for (let cx = sx; has(cx, y); cx--) h += board[idx(size, cx, y)]!.letter;
  if ([...h].length >= 2) out.push(h);
  let sy = y;
  while (has(x, sy - 1)) sy--;
  let v = '';
  for (let cy = sy; has(x, cy); cy++) v += board[idx(size, x, cy)]!.letter;
  if ([...v].length >= 2) out.push(v);
  return out;
}
