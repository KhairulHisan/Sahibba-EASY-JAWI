import { motion } from 'motion/react';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import type { Bonus, BoardCell } from '../engine/board';
import { BONUS_META, idx as cellIndex, type BoardCells, type BoardLayout } from '../engine/board';
import { letterInfo } from '../engine/jawi';
import { fx } from '../lib/feedback';
import { Icon } from './Icon';
import { TileFace, type TileState } from './Tile';

export interface DraftCell {
  tileId: string;
  letter: string;
  value: number;
  isBlank: boolean;
}

export interface BoardProps {
  layout: BoardLayout;
  cells: BoardCells;
  draft: Map<number, DraftCell>;
  draftState: TileState;
  errorCells?: Set<number>;
  hintCells?: Map<number, string>;
  lastMoveCells?: Set<number>;
  targetCells?: Set<number>;
  wave?: { key: number; order: number[] } | null;
  wobbleKey?: number;
  hoverCell?: number | null;
  interactive: boolean;
  onCellActivate: (x: number, y: number) => void;
  bindDraftTile?: (tileId: string, size: number) => Record<string, unknown>;
  scrollRef?: (el: HTMLDivElement | null) => void;
  minZoom?: number;
  label?: string;
}

const BONUS_STYLE: Record<string, string> = {
  L2: 'bg-[#d3f0e6] text-jade-700',
  L3: 'bg-jade-500 text-white',
  W2: 'bg-mango-200 text-mango-600',
  W3: 'bg-coral-500 text-white',
};

const ZOOM_MIN = 1;
const ZOOM_MAX = 2.6;

/**
 * Accessible 13×13 board. The grid is ALWAYS dir="ltr" so column x maps to
 * visual column x; Jawi reading direction is handled by the engine.
 * Zoom: +/- buttons, pinch (two pointers) or Ctrl/⌘ + wheel.
 * Pan: native scroll (wheel/scrollbars) or one-pointer drag on the board.
 */
export function Board(props: BoardProps) {
  const { layout, cells, draft, draftState, errorCells, hintCells, lastMoveCells, targetCells, wave, wobbleKey, hoverCell, interactive, onCellActivate, bindDraftTile, scrollRef, label } = props;
  const size = layout.size;
  const viewport = useRef<HTMLDivElement | null>(null);
  const outer = useRef<HTMLDivElement | null>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(props.minZoom ?? 1);
  const anchor = useRef<{ x: number; y: number; from: number } | null>(null);
  const [focus, setFocus] = useState({ x: layout.center.x, y: layout.center.y });

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setVp({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setVp({ w: el.clientWidth, h: el.clientHeight });
    const o = outer.current!;
    const ro2 = new ResizeObserver(() => setBox({ w: o.clientWidth, h: o.clientHeight }));
    ro2.observe(o);
    return () => {
      ro.disconnect();
      ro2.disconnect();
    };
  }, []);
  // Zoom controls live in their own strip so they never cover board cells:
  // below the board when there is spare height, otherwise beside it.
  const controlsBeside = box.w - box.h > 52;

  // Available square (viewport minus outer padding), then subtract the grid's
  // own padding + gaps so the whole board fits exactly at zoom 1.
  const GAP = 2;
  const FRAME = 6 + (size - 1) * GAP;
  const base = Math.max(220, Math.min(vp.w, vp.h || vp.w) - 8);
  const cellPx = Math.max(12, Math.floor(((base - FRAME) * zoom) / size * 100) / 100);
  const boardPx = cellPx * size + FRAME;

  const applyZoom = useCallback(
    (next: number, at?: { x: number; y: number }) => {
      const el = viewport.current;
      setZoom((z) => {
        const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 100) / 100));
        if (clamped !== z && el) anchor.current = { x: at?.x ?? el.clientWidth / 2, y: at?.y ?? el.clientHeight / 2, from: z };
        return clamped;
      });
    },
    [],
  );

  // Keep the zoom anchor point stationary.
  useLayoutEffect(() => {
    const el = viewport.current;
    const a = anchor.current;
    if (!el || !a) return;
    const ratio = zoom / a.from;
    el.scrollLeft = (el.scrollLeft + a.x) * ratio - a.x;
    el.scrollTop = (el.scrollTop + a.y) * ratio - a.y;
    anchor.current = null;
  }, [zoom]);

  // Pinch-zoom + drag-to-pan (touch-action: none on the viewport).
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ kind: 'pan' | 'pinch' | 'none'; sx: number; sy: number; sl: number; st: number; d0: number; z0: number; moved: boolean }>({
    kind: 'none', sx: 0, sy: 0, sl: 0, st: 0, d0: 0, z0: 1, moved: false,
  });
  const suppressClick = useRef(false);
  // Stable handlers so memoised cells don't re-render when the parent passes new closures.
  const activateRef = useRef(onCellActivate);
  activateRef.current = onCellActivate;
  const activate = useCallback((x: number, y: number) => activateRef.current(x, y), []);
  const focusCell = useCallback((x: number, y: number) => setFocus({ x, y }), []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-drag]')) return;
    const el = viewport.current!;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 1) {
      Object.assign(g, { kind: 'pan', sx: e.clientX, sy: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false });
      suppressClick.current = false;
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      Object.assign(g, { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: zoom, moved: true });
      suppressClick.current = true;
    }
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const el = viewport.current!;
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = el.getBoundingClientRect();
      if (g.d0 > 0) applyZoom(g.z0 * (d / g.d0), { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top });
    } else if (g.kind === 'pan') {
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (!g.moved && Math.hypot(dx, dy) > 6) {
        g.moved = true;
        suppressClick.current = true;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      if (g.moved) {
        el.scrollLeft = g.sl - dx;
        el.scrollTop = g.st - dy;
      }
    }
  };
  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current.kind = 'none';
  };

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setZoom((z) => {
        const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        anchor.current = { x: e.clientX - r.left, y: e.clientY - r.top, from: z };
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      const nx = Math.min(size - 1, Math.max(0, focus.x + m[0]));
      const ny = Math.min(size - 1, Math.max(0, focus.y + m[1]));
      setFocus({ x: nx, y: ny });
      // Focus synchronously so rapid key presses always target the right cell.
      viewport.current?.querySelector<HTMLElement>(`[data-cell][data-x="${nx}"][data-y="${ny}"]`)?.focus();
    }
  };

  const waveDelay = new Map<number, number>();
  wave?.order.forEach((k, i) => waveDelay.set(k, i * 0.025));

  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      const k = cellIndex(size, x, y);
      const d = draft.get(k);
      const delay = waveDelay.get(k);
      row.push(
        <BoardCellView
          key={k}
          x={x}
          y={y}
          cellPx={cellPx}
          placed={cells[k] ?? null}
          draft={d ?? null}
          draftState={draftState}
          bonus={layout.bonuses[k]}
          isCenter={x === layout.center.x && y === layout.center.y}
          isError={errorCells?.has(k) ?? false}
          hint={hintCells?.get(k)}
          isTarget={targetCells?.has(k) ?? false}
          isHover={hoverCell === k}
          isLastMove={lastMoveCells?.has(k) ?? false}
          waveKey={delay !== undefined && wave ? wave.key : 0}
          waveDelay={delay}
          wobbleKey={d ? (wobbleKey ?? 0) : 0}
          focused={focus.x === x && focus.y === y}
          interactive={interactive}
          bindDraftTile={d && interactive ? bindDraftTile : undefined}
          onActivate={activate}
          onFocusCell={focusCell}
          suppressClick={suppressClick}
        />,
      );
    }
    rows.push(
      <div key={y} role="row" className="contents">
        {row}
      </div>,
    );
  }

  const zoomBy = (f: number) => {
    fx('board-zoom');
    applyZoom(zoom * f);
  };

  return (
    <div ref={outer} className={`flex h-full w-full ${controlsBeside ? 'flex-row' : 'flex-col'}`}>
      <div
        ref={(el) => {
          viewport.current = el;
          scrollRef?.(el);
        }}
        className="no-scrollbar min-h-0 min-w-0 flex-1 overflow-auto"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        data-testid="board-viewport"
      >
        <div className="grid min-h-full min-w-full place-items-center p-1" style={{ width: 'max-content', minWidth: '100%' }}>
          <div
            dir="ltr"
            role="grid"
            aria-label={label ?? `Papan permainan ${size} kali ${size}. Guna kekunci anak panah untuk bergerak, Enter untuk meletak jubin.`}
            aria-rowcount={size}
            aria-colcount={size}
            onKeyDown={onKeyDown}
            className="grid gap-[2px] rounded-xl bg-navy-900 p-[3px] shadow-[0_6px_0_#071a35]"
            style={{ gridTemplateColumns: `repeat(${size}, ${cellPx}px)`, width: boardPx, touchAction: 'none' }}
            data-testid="board"
          >
            {rows}
          </div>
        </div>
      </div>
      <div className={`flex shrink-0 justify-end gap-1.5 p-1 ${controlsBeside ? 'flex-col' : 'flex-row'}`}>
        <button type="button" onClick={() => zoomBy(1.3)} disabled={zoom >= ZOOM_MAX} className="grid size-11 place-items-center rounded-full bg-cream-50/95 text-navy-800 shadow-md ring-1 ring-cream-300 disabled:opacity-40" aria-label="Zum masuk papan">
          <Icon name="zoomIn" />
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.3)} disabled={zoom <= ZOOM_MIN} className="grid size-11 place-items-center rounded-full bg-cream-50/95 text-navy-800 shadow-md ring-1 ring-cream-300 disabled:opacity-40" aria-label="Zum keluar papan">
          <Icon name="zoomOut" />
        </button>
      </div>
    </div>
  );
}

interface CellProps {
  x: number;
  y: number;
  cellPx: number;
  placed: BoardCell | null;
  draft: DraftCell | null;
  draftState: TileState;
  bonus: Bonus | undefined;
  isCenter: boolean;
  isError: boolean;
  hint: string | undefined;
  isTarget: boolean;
  isHover: boolean;
  isLastMove: boolean;
  waveKey: number;
  waveDelay: number | undefined;
  wobbleKey: number;
  focused: boolean;
  interactive: boolean;
  bindDraftTile?: (tileId: string, size: number) => Record<string, unknown>;
  onActivate: (x: number, y: number) => void;
  onFocusCell: (x: number, y: number) => void;
  suppressClick: MutableRefObject<boolean>;
}

/** Only re-render a cell when something it shows actually changed. */
function sameCell(a: CellProps, b: CellProps): boolean {
  const samePlaced = a.placed === b.placed || (!!a.placed && !!b.placed && a.placed.tileId === b.placed.tileId && a.placed.letter === b.placed.letter);
  const sameDraft = a.draft === b.draft || (!!a.draft && !!b.draft && a.draft.tileId === b.draft.tileId && a.draft.letter === b.draft.letter);
  return (
    samePlaced &&
    sameDraft &&
    a.cellPx === b.cellPx &&
    a.isError === b.isError &&
    a.hint === b.hint &&
    a.isTarget === b.isTarget &&
    a.isHover === b.isHover &&
    a.isLastMove === b.isLastMove &&
    a.waveKey === b.waveKey &&
    a.wobbleKey === b.wobbleKey &&
    a.focused === b.focused &&
    a.interactive === b.interactive &&
    (!a.draft || (a.draftState === b.draftState && a.bindDraftTile === b.bindDraftTile))
  );
}

const BoardCellView = memo(function BoardCellView(p: CellProps) {
  const { x, y, cellPx, placed, draft: d, bonus, isCenter, isError, hint } = p;
  const tilePx = cellPx - 2;
  let content = null;
  let aria = `Baris ${y + 1}, lajur ${x + 1}`;
  const wave = p.waveDelay !== undefined ? { kind: 'wave' as const, key: p.waveKey, delay: p.waveDelay } : null;
  if (placed) {
    aria += `: ${placed.isBlank ? 'joker ' : ''}${letterInfo(placed.letter)?.name ?? placed.letter}`;
    content = <TileFace letter={placed.letter} value={placed.value} isBlank={placed.isBlank} size={tilePx} highlight={p.isLastMove} anim={wave} />;
  } else if (d) {
    aria += `: jubin anda ${letterInfo(d.letter)?.name ?? d.letter} (belum disahkan)`;
    content = (
      <motion.div
        className="h-full w-full"
        initial={{ scale: 0.6, opacity: 0.4 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 26, mass: 0.6 }}
        {...(p.bindDraftTile ? p.bindDraftTile(d.tileId, tilePx) : {})}
      >
        <TileFace
          letter={d.letter}
          value={d.value}
          isBlank={d.isBlank}
          size={tilePx}
          pending
          state={isError ? 'error' : p.draftState}
          anim={p.wobbleKey ? { kind: 'wobble', key: p.wobbleKey } : wave}
        />
      </motion.div>
    );
  } else if (hint) {
    aria += `: cadangan huruf ${letterInfo(hint)?.name ?? hint}`;
    content = (
      <span lang="ms-Arab" dir="rtl" className="font-jawi font-bold text-jade-700/80" style={{ fontSize: cellPx * 0.55 }}>
        {hint}
      </span>
    );
  } else if (isCenter) {
    aria += ', petak mula, perkataan ganda dua';
    content = <Icon name="star" size={Math.max(10, cellPx * 0.62)} className="text-mango-600" strokeWidth={2.4} />;
  } else if (bonus) {
    aria += `, ${BONUS_META[bonus].label}`;
    content = (
      <span className="font-display leading-none font-bold" style={{ fontSize: Math.max(7, cellPx * 0.3) }} aria-hidden="true">
        {BONUS_META[bonus].short}
      </span>
    );
  }
  const isHover = p.isHover && !placed && !d;
  const bg = placed || d ? 'bg-transparent' : isCenter ? 'bg-mango-200' : bonus ? BONUS_STYLE[bonus] : 'bg-cream-200';
  return (
    <button
      type="button"
      role="gridcell"
      data-cell=""
      data-x={x}
      data-y={y}
      data-placed={placed ? '' : undefined}
      tabIndex={p.focused ? 0 : -1}
      aria-label={aria}
      onFocus={() => p.onFocusCell(x, y)}
      onClick={() => {
        if (p.suppressClick.current) return;
        if (p.interactive) p.onActivate(x, y);
      }}
      className={`relative grid place-items-center overflow-visible p-px ${bg} ${isError && !d ? 'ring-2 ring-coral-500 ring-inset' : ''} ${isHover ? 'ring-[3px] ring-mango-500 ring-inset' : ''} ${p.isTarget ? 'animate-pulse-soft ring-[3px] ring-mango-500 ring-inset' : ''}`}
      style={{ width: cellPx, height: cellPx, borderRadius: Math.max(3, cellPx * 0.14) }}
    >
      {content}
    </button>
  );
}, sameCell);
