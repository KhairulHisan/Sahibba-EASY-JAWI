/**
 * Shared "table" interaction for any game screen (single player and
 * multiplayer): the uncommitted draft on the board, rack order, tap-to-place,
 * pointer drag & drop, joker letter choice and recall/shuffle.
 * The caller owns persistence of `draft` and `rackOrder`.
 */
import { useCallback, useMemo, useState } from 'react';
import type { DraftCell } from '../../components/Board';
import { TileFace } from '../../components/Tile';
import { toast } from '../../components/Toast';
import { bonusAt, idx, type BoardCells, type BoardLayout } from '../../engine/board';
import type { Placement, Tile } from '../../engine/types';
import { fx } from '../../lib/feedback';
import { useTileDrag, type DragSource, type DropTarget } from '../single/useTileDrag';
import { orderedRack, syncOrder } from './rackOrder';

export { orderedRack, syncOrder };

export interface TileTableOptions {
  layout: BoardLayout;
  board: BoardCells;
  rack: Tile[];
  isYourTurn: boolean;
  /** False while paused, finished or waiting for the server. */
  interactive: boolean;
  draft: Placement[];
  setDraft: (d: Placement[]) => void;
  rackOrder: string[];
  setRackOrder: (ids: string[]) => void;
  scrollContainer: () => HTMLElement | null;
  /** Tap on a committed tile (e.g. show the word's meaning). */
  onPlacedTileTap?: (cellIndex: number) => void;
  /** Called after a tile is placed (e.g. close a hint panel). */
  onPlaced?: () => void;
}

export function useTileTable(o: TileTableOptions) {
  const { layout, board, rack, isYourTurn, draft, setDraft, rackOrder, setRackOrder } = o;
  const [selected, setSelected] = useState<string | null>(null);
  const [blankFor, setBlankFor] = useState<{ tileId: string; x: number; y: number } | null>(null);
  const [wobble, setWobble] = useState(0);
  const [hoverCell, setHoverCell] = useState<number | null>(null);
  const [hoverRack, setHoverRack] = useState(false);

  const rackById = useMemo(() => new Map(rack.map((t) => [t.id, t])), [rack]);
  // Drop draft entries that no longer match the rack/board (after reload or a server update).
  const validDraft = useMemo(() => draft.filter((p) => rackById.has(p.tileId) && !board[idx(layout.size, p.x, p.y)]), [draft, rackById, board, layout.size]);
  const draftMap = useMemo(() => {
    const m = new Map<number, DraftCell>();
    for (const p of validDraft) {
      const t = rackById.get(p.tileId)!;
      m.set(idx(layout.size, p.x, p.y), { tileId: t.id, letter: t.isBlank ? (p.letter ?? '') : t.letter, value: t.value, isBlank: t.isBlank });
    }
    return m;
  }, [validDraft, rackById, layout.size]);
  const draftIds = useMemo(() => new Set(validDraft.map((p) => p.tileId)), [validDraft]);
  const rackTiles = useMemo(() => orderedRack(rack, rackOrder).filter((t) => !draftIds.has(t.id)), [rack, rackOrder, draftIds]);

  const bumpWobble = useCallback(() => setWobble((w) => w + 1), []);

  const placeTile = useCallback(
    (tileId: string, x: number, y: number, letter?: string) => {
      if (!isYourTurn) return;
      const k = idx(layout.size, x, y);
      const occupant = draftMap.get(k);
      if (board[k] || (occupant && occupant.tileId !== tileId)) {
        fx('word-invalid');
        setWobble((w) => w + 1);
        return;
      }
      const tile = rackById.get(tileId);
      if (!tile) return;
      // A joker moved from one cell to another keeps the letter already chosen.
      letter ??= validDraft.find((p) => p.tileId === tileId)?.letter;
      if (tile.isBlank && !letter) {
        setBlankFor({ tileId, x, y });
        return;
      }
      setDraft([...validDraft.filter((p) => p.tileId !== tileId), { tileId, x, y, ...(tile.isBlank ? { letter } : {}) }]);
      setSelected(null);
      o.onPlaced?.();
      fx('tile-drop');
      if (bonusAt(layout, x, y)) window.setTimeout(() => fx('bonus-cell'), 90);
    },
    [isYourTurn, layout, draftMap, board, rackById, validDraft, setDraft, o.onPlaced],
  );

  const returnToRack = useCallback(
    (tileId: string, index?: number) => {
      if (draftIds.has(tileId)) setDraft(validDraft.filter((p) => p.tileId !== tileId));
      if (index !== undefined) {
        const visible = rackTiles.map((t) => t.id).filter((id) => id !== tileId);
        const from = rackTiles.findIndex((t) => t.id === tileId);
        const at = from >= 0 && from < index ? index - 1 : index;
        visible.splice(Math.max(0, Math.min(visible.length, at)), 0, tileId);
        setRackOrder([...visible, ...[...draftIds].filter((id) => id !== tileId)]);
      }
      fx('tile-snap');
    },
    [draftIds, validDraft, rackTiles, setDraft, setRackOrder],
  );

  const onDrop = useCallback(
    (src: DragSource, target: DropTarget) => {
      if (target.kind === 'cell') {
        if (!isYourTurn) {
          toast({ tone: 'navy', content: 'Tunggu giliran anda dahulu.' });
          return;
        }
        placeTile(src.tileId, target.x, target.y);
      } else if (target.kind === 'rack') returnToRack(src.tileId, target.index);
    },
    [isYourTurn, placeTile, returnToRack],
  );

  const onTap = useCallback(
    (src: DragSource) => {
      if (src.from === 'board') {
        returnToRack(src.tileId);
        return;
      }
      fx('tile-pickup');
      setSelected((s) => (s === src.tileId ? null : src.tileId));
    },
    [returnToRack],
  );

  const drag = useTileDrag({
    onDrop,
    onTap,
    onHover: (t) => {
      setHoverCell(t.kind === 'cell' ? idx(layout.size, t.x, t.y) : null);
      setHoverRack(t.kind === 'rack');
    },
    disabled: !o.interactive,
    scrollContainer: o.scrollContainer,
  });

  const onCellActivate = (x: number, y: number) => {
    const k = idx(layout.size, x, y);
    const d = draftMap.get(k);
    if (d) {
      returnToRack(d.tileId);
      return;
    }
    if (board[k]) {
      o.onPlacedTileTap?.(k);
      return;
    }
    if (!isYourTurn) {
      toast({ tone: 'navy', content: 'Menunggu pemain… bukan giliran anda.' });
      return;
    }
    if (selected) placeTile(selected, x, y);
    else if (rackTiles.length) toast({ tone: 'navy', content: 'Pilih jubin dari rak dahulu, kemudian ketik petak.' }, 1800);
  };

  const recallOrShuffle = () => {
    if (validDraft.length) {
      setDraft([]);
      fx('tile-snap');
      return;
    }
    const ids = rackTiles.map((t) => t.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    }
    setRackOrder(ids);
    fx('tile-shuffle');
  };

  const pickBlankLetter = (letter: string) => {
    const b = blankFor;
    setBlankFor(null);
    if (b) placeTile(b.tileId, b.x, b.y, letter);
  };

  const dragTile = drag.visual ? rackById.get(drag.visual.tileId) : null;
  const ghost =
    drag.visual && dragTile ? (
      <div ref={drag.ghostRef} className="pointer-events-none fixed top-0 left-0 z-[70] drop-shadow-xl" style={{ width: drag.visual.size, height: drag.visual.size }} aria-hidden="true">
        <TileFace
          letter={dragTile.isBlank ? (validDraft.find((p) => p.tileId === dragTile.id)?.letter ?? '') : dragTile.letter}
          value={dragTile.value}
          isBlank={dragTile.isBlank}
          size={drag.visual.size}
          selected
        />
      </div>
    ) : null;

  return {
    rackById,
    validDraft,
    draftMap,
    draftIds,
    rackTiles,
    selected,
    setSelected,
    blankFor,
    setBlankFor,
    pickBlankLetter,
    wobble,
    bumpWobble,
    hoverCell,
    hoverRack,
    placeTile,
    returnToRack,
    drag,
    onTap,
    onCellActivate,
    recallOrShuffle,
    ghost,
  };
}
