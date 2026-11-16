/**
 * Board geometry.
 *
 * Coordinates: x = column index increasing LEFT → RIGHT, y = row index
 * increasing TOP → BOTTOM. Horizontal Jawi words read RIGHT → LEFT, i.e. the
 * first logical letter sits at the largest x and each following letter is at
 * x − 1. Vertical words read TOP → BOTTOM (y + 1).
 */

export type Bonus = 'L2' | 'L3' | 'W2' | 'W3';

export interface BoardLayout {
  id: string;
  name: string;
  size: number;
  center: { x: number; y: number };
  /** Bonus per cell index (y * size + x); undefined = plain cell. */
  bonuses: (Bonus | undefined)[];
}

export interface BoardCell {
  letter: string;
  value: number;
  isBlank: boolean;
  tileId: string;
  /** Index into GameState.moves of the move that placed this tile. */
  moveIndex: number;
}

export type BoardCells = (BoardCell | null)[];

export const BONUS_META: Record<Bonus, { short: string; label: string; letterMult: number; wordMult: number }> = {
  L2: { short: '2×H', label: 'Huruf ganda dua', letterMult: 2, wordMult: 1 },
  L3: { short: '3×H', label: 'Huruf ganda tiga', letterMult: 3, wordMult: 1 },
  W2: { short: '2×P', label: 'Perkataan ganda dua', letterMult: 1, wordMult: 2 },
  W3: { short: '3×P', label: 'Perkataan ganda tiga', letterMult: 1, wordMult: 3 },
};

/**
 * Build a layout with full D4 (8-fold) symmetry from cells listed in one
 * octant (0 ≤ row ≤ col ≤ centre). Original EASY JAWI design.
 */
export function symmetricLayout(
  id: string,
  name: string,
  size: number,
  octant: { r: number; c: number; bonus: Bonus }[],
  centerBonus: Bonus | undefined,
): BoardLayout {
  if (size % 2 === 0) throw new Error('Board size must be odd so it has a centre cell');
  const n = size - 1;
  const mid = n / 2;
  const bonuses: (Bonus | undefined)[] = new Array(size * size).fill(undefined);
  for (const { r, c, bonus } of octant) {
    const pts: [number, number][] = [
      [r, c], [c, r], [r, n - c], [n - c, r],
      [n - r, c], [c, n - r], [n - r, n - c], [n - c, n - r],
    ];
    for (const [row, col] of pts) bonuses[row * size + col] = bonus;
  }
  bonuses[mid * size + mid] = centerBonus;
  return { id, name, size, center: { x: mid, y: mid }, bonuses };
}

/** Default 13×13 EASY JAWI layout ("Wau Bulan") — 45 bonus cells incl. centre. */
export const LAYOUT_WAU_13: BoardLayout = symmetricLayout(
  'wau-13',
  'Wau Bulan 13×13',
  13,
  [
    { r: 0, c: 2, bonus: 'W3' },
    { r: 0, c: 6, bonus: 'L2' },
    { r: 1, c: 1, bonus: 'W2' },
    { r: 1, c: 5, bonus: 'L3' },
    { r: 2, c: 4, bonus: 'L2' },
    { r: 3, c: 3, bonus: 'W2' },
    { r: 4, c: 4, bonus: 'L3' },
    { r: 5, c: 6, bonus: 'L2' },
  ],
  'W2',
);

export const LAYOUTS: Record<string, BoardLayout> = { [LAYOUT_WAU_13.id]: LAYOUT_WAU_13 };

export function getLayout(id: string): BoardLayout {
  const layout = LAYOUTS[id];
  if (!layout) throw new Error(`Unknown board layout: ${id}`);
  return layout;
}

export const idx = (size: number, x: number, y: number) => y * size + x;

export function inBounds(size: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < size && y < size;
}

export function createEmptyBoard(layout: BoardLayout): BoardCells {
  return new Array(layout.size * layout.size).fill(null);
}

export function bonusAt(layout: BoardLayout, x: number, y: number): Bonus | undefined {
  return layout.bonuses[idx(layout.size, x, y)];
}

export function isBoardEmpty(cells: BoardCells): boolean {
  return cells.every((c) => c === null);
}

export function countBonuses(layout: BoardLayout): Record<Bonus, number> {
  const out: Record<Bonus, number> = { L2: 0, L3: 0, W2: 0, W3: 0 };
  for (const b of layout.bonuses) if (b) out[b] += 1;
  return out;
}
