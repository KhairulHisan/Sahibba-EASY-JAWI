import { Rng } from './rng';
import type { TileDistribution } from './tiles';
import type { Tile } from './types';

/** Build the full, unshuffled tile set from a distribution. */
export function buildTileSet(dist: TileDistribution): Tile[] {
  const tiles: Tile[] = [];
  let n = 0;
  for (const spec of dist.tiles) {
    for (let i = 0; i < spec.count; i++) tiles.push({ id: `t${++n}`, letter: spec.letter, value: spec.value, isBlank: false });
  }
  for (let i = 0; i < dist.blank.count; i++) tiles.push({ id: `t${++n}`, letter: '', value: 0, isBlank: true });
  return tiles;
}

/** Build and shuffle a bag. The last element is drawn first. */
export function createBag(dist: TileDistribution, rng: Rng): Tile[] {
  return rng.shuffle(buildTileSet(dist));
}

/** Draw up to `count` tiles from the end of the bag (mutates bag). */
export function drawTiles(bag: Tile[], count: number): Tile[] {
  const n = Math.max(0, Math.min(count, bag.length));
  return bag.splice(bag.length - n, n).reverse();
}
