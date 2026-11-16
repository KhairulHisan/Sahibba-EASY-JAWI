import { AnimatePresence, motion } from 'motion/react';
import type { CSSProperties } from 'react';
import type { Tile } from '../engine/types';
import { TileFace, tileAriaLabel } from './Tile';

export function TileRack({
  tiles,
  selectedId,
  swapSelection,
  bindTile,
  onKeyActivate,
  tileSize,
  showNames,
  disabled,
  hoverRack,
}: {
  tiles: Tile[];
  selectedId: string | null;
  swapSelection?: Set<string>;
  bindTile: (tileId: string, size: number) => Record<string, unknown>;
  onKeyActivate: (tileId: string) => void;
  tileSize: number;
  showNames: boolean;
  disabled?: boolean;
  hoverRack?: boolean;
}) {
  return (
    <div
      data-rack=""
      role="listbox"
      aria-label={`Rak jubin anda: ${tiles.length} jubin. Pilih jubin kemudian pilih petak di papan.`}
      className={`flex min-h-[64px] items-center justify-center gap-1.5 rounded-2xl border-2 px-2 py-2 transition-colors ${hoverRack ? 'border-mango-500 bg-mango-100' : 'border-[#9b6b2f] bg-[#b98446]'} shadow-[inset_0_-4px_0_rgb(0_0_0/0.18)]`}
      data-testid="rack"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {tiles.map((t, i) => {
          const selected = selectedId === t.id || swapSelection?.has(t.id);
          const binding = disabled ? {} : bindTile(t.id, tileSize);
          const bindStyle = (binding as { style?: CSSProperties }).style;
          return (
            <motion.button
              layout
              key={t.id}
              type="button"
              role="option"
              aria-selected={!!selected}
              aria-label={tileAriaLabel(t.letter, t.value, t.isBlank)}
              data-rack-index={i}
              data-tile-letter={t.isBlank ? '' : t.letter}
              data-tile-id={t.id}
              disabled={disabled}
              className="relative shrink-0 rounded-[10px] disabled:opacity-60"
              {...binding}
              style={{ ...bindStyle, width: tileSize, height: tileSize }}
              initial={{ opacity: 0, y: 18, scale: 0.7 }}
              animate={{ opacity: 1, y: selected ? -8 : 0, scale: selected ? 1.06 : 1 }}
              exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', stiffness: 600, damping: 30, mass: 0.6 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onKeyActivate(t.id);
                }
              }}
            >
              <TileFace letter={t.letter} value={t.value} isBlank={t.isBlank} size={tileSize} selected={!!selected} showName={showNames} />
            </motion.button>
          );
        })}
      </AnimatePresence>
      {tiles.length === 0 && <span className="px-2 text-sm font-semibold text-cream-100">Semua jubin di papan</span>}
    </div>
  );
}
