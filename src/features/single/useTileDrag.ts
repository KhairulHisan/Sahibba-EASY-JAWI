import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { fx } from '../../lib/feedback';

export interface DragSource {
  tileId: string;
  from: 'rack' | 'board';
}

export type DropTarget = { kind: 'cell'; x: number; y: number } | { kind: 'rack'; index: number } | { kind: 'none' };

export interface DragVisual {
  tileId: string;
  size: number;
}

const DRAG_THRESHOLD = 6;

/** Resolve what is under a viewport point (ghost has pointer-events: none). */
export function hitTest(clientX: number, clientY: number): DropTarget {
  const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  const cell = el?.closest<HTMLElement>('[data-cell]');
  if (cell) return { kind: 'cell', x: Number(cell.dataset.x), y: Number(cell.dataset.y) };
  const rack = el?.closest<HTMLElement>('[data-rack]');
  if (rack) {
    const slots = Array.from(rack.querySelectorAll<HTMLElement>('[data-rack-index]'));
    let index = slots.length;
    for (const s of slots) {
      const r = s.getBoundingClientRect();
      if (clientX < r.left + r.width / 2) {
        index = Number(s.dataset.rackIndex);
        break;
      }
    }
    return { kind: 'rack', index };
  }
  return { kind: 'none' };
}

/**
 * Pointer-based drag & drop that works identically for mouse, pen and touch
 * (HTML5 DnD does not work on touch screens). A press without movement is a
 * tap → select-and-place flow. The ghost follows the pointer via a ref
 * (no React re-render per move).
 */
export function useTileDrag(opts: {
  onDrop: (src: DragSource, target: DropTarget) => void;
  onTap: (src: DragSource) => void;
  onHover?: (target: DropTarget) => void;
  disabled?: boolean;
  scrollContainer?: () => HTMLElement | null;
}) {
  const ghostRef = useRef<HTMLDivElement>(null);
  const [visual, setVisual] = useState<DragVisual | null>(null);
  const press = useRef<{ src: DragSource; x: number; y: number; dragging: boolean; size: number; pointerId: number } | null>(null);
  const lastHover = useRef<string>('');
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const moveGhost = (x: number, y: number) => {
    const g = ghostRef.current;
    if (g && press.current) {
      const s = press.current.size;
      g.style.transform = `translate(${x - s / 2}px, ${y - s * 0.9}px) scale(1.12)`;
    }
  };

  const autoScroll = (x: number, y: number) => {
    const sc = optsRef.current.scrollContainer?.();
    if (!sc) return;
    const r = sc.getBoundingClientRect();
    const edge = 28;
    if (x < r.left + edge && x > r.left) sc.scrollLeft -= 10;
    else if (x > r.right - edge && x < r.right) sc.scrollLeft += 10;
    if (y < r.top + edge && y > r.top) sc.scrollTop -= 10;
    else if (y > r.bottom - edge && y < r.bottom) sc.scrollTop += 10;
  };

  const bind = useCallback(
    (src: DragSource, size: number) => ({
      'data-drag': '',
      style: { touchAction: 'none' as const },
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        if (optsRef.current.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.stopPropagation();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        press.current = { src, x: e.clientX, y: e.clientY, dragging: false, size, pointerId: e.pointerId };
      },
      onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
        const p = press.current;
        if (!p || p.pointerId !== e.pointerId) return;
        if (!p.dragging) {
          if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return;
          p.dragging = true;
          fx('tile-pickup');
          setVisual({ tileId: p.src.tileId, size: Math.max(44, p.size) });
          requestAnimationFrame(() => moveGhost(e.clientX, e.clientY));
        }
        moveGhost(e.clientX, e.clientY);
        autoScroll(e.clientX, e.clientY);
        if (optsRef.current.onHover) {
          const t = hitTest(e.clientX, e.clientY);
          const key = t.kind === 'cell' ? `${t.x},${t.y}` : t.kind;
          if (key !== lastHover.current) {
            lastHover.current = key;
            optsRef.current.onHover(t);
          }
        }
      },
      onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
        const p = press.current;
        if (!p || p.pointerId !== e.pointerId) return;
        press.current = null;
        lastHover.current = '';
        optsRef.current.onHover?.({ kind: 'none' });
        if (p.dragging) {
          setVisual(null);
          optsRef.current.onDrop(p.src, hitTest(e.clientX, e.clientY));
        } else {
          optsRef.current.onTap(p.src);
        }
      },
      onPointerCancel: () => {
        press.current = null;
        lastHover.current = '';
        setVisual(null);
        optsRef.current.onHover?.({ kind: 'none' });
      },
    }),
    [],
  );

  return { bind, ghostRef, visual };
}
