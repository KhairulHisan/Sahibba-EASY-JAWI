import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { TileFace } from '../../components/Tile';
import type { Tile } from '../../engine/types';

/** Pick rack tiles to return to the bag; falls back to "pass" when the bag is too small. */
export function SwapSheet({
  open,
  onClose,
  tiles,
  bagCount,
  minBagForSwap,
  onSwap,
  onPassInstead,
}: {
  open: boolean;
  onClose: () => void;
  tiles: Tile[];
  bagCount: number;
  minBagForSwap: number;
  onSwap: (tileIds: string[]) => void;
  onPassInstead: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open) setSel(new Set());
  }, [open]);
  const allowed = (n: number) => bagCount >= Math.max(minBagForSwap, n);

  return (
    <Sheet open={open} onClose={onClose} title="Tukar jubin">
      {allowed(1) ? (
        <>
          <p className="mb-3 text-sm text-ink-soft">Pilih jubin untuk dipulangkan ke beg. Menukar jubin menamatkan giliran anda (0 mata).</p>
          <div className="mb-4 flex flex-wrap justify-center gap-2" role="group" aria-label="Pilih jubin untuk ditukar">
            {tiles.map((t) => {
              const on = sel.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${t.isBlank ? 'Joker' : t.letter}${on ? ', dipilih' : ''}`}
                  onClick={() => {
                    const n = new Set(sel);
                    if (on) n.delete(t.id);
                    else n.add(t.id);
                    setSel(n);
                  }}
                  className={`size-14 rounded-xl transition-transform ${on ? '-translate-y-1.5' : ''}`}
                  data-testid="swap-tile"
                >
                  <TileFace letter={t.letter} value={t.value} isBlank={t.isBlank} size={56} selected={on} />
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button tone="cream" className="flex-1" onClick={() => setSel(new Set(tiles.map((t) => t.id)))}>
              Pilih semua
            </Button>
            <Button tone="jade" className="flex-1" disabled={sel.size === 0 || !allowed(sel.size)} onClick={() => onSwap([...sel])} data-testid="confirm-swap">
              Tukar {sel.size || ''} jubin
            </Button>
          </div>
        </>
      ) : (
        <div>
          <p className="mb-4 text-ink-soft">
            Beg tinggal <b>{bagCount}</b> jubin. Tukar jubin hanya dibenarkan apabila beg ada sekurang-kurangnya <b>{minBagForSwap}</b> jubin.
          </p>
          <Button tone="navy" className="w-full" onClick={onPassInstead}>
            Langkau giliran sahaja
          </Button>
        </div>
      )}
    </Sheet>
  );
}
