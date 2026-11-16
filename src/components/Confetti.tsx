import { motion, useReducedMotion } from 'motion/react';
import { useMemo } from 'react';

const COLORS = ['#f7b32b', '#1f9d74', '#ef6f5e', '#2a63a8', '#fdeac2'];

/** Short (≈1.6 s) celebratory burst; disabled under reduced motion. */
export function Confetti({ burstKey, pieces = 46 }: { burstKey: number; pieces?: number }) {
  const reduce = useReducedMotion();
  const parts = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        id: `${burstKey}-${i}`,
        x: (Math.random() - 0.5) * 520,
        y: -(160 + Math.random() * 260),
        r: Math.random() * 540 - 270,
        c: COLORS[i % COLORS.length],
        w: 6 + Math.random() * 6,
        d: 1.2 + Math.random() * 0.5,
      })),
    [burstKey, pieces],
  );
  if (reduce || !burstKey) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center overflow-hidden" aria-hidden="true">
      {parts.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-sm"
          style={{ width: p.w, height: p.w * 1.6, background: p.c }}
          initial={{ x: 0, y: 40, rotate: 0, opacity: 1 }}
          animate={{ x: p.x, y: [40, p.y, p.y + 520], rotate: p.r, opacity: [1, 1, 0] }}
          transition={{ duration: p.d, ease: 'easeOut', times: [0, 0.35, 1] }}
        />
      ))}
    </div>
  );
}
