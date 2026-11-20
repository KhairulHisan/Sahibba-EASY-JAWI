import { motion } from 'motion/react';
import { TileFace } from './Tile';

const LETTERS = [
  { ch: 'ج', v: 4 },
  { ch: 'ا', v: 1 },
  { ch: 'و', v: 1 },
  { ch: 'ي', v: 1 },
];

/** EASY JAWI wordmark: Latin title + Jawi tiles spelling جاوي (right → left). */
export function Logo({ size = 'lg', animate = true }: { size?: 'md' | 'lg'; animate?: boolean }) {
  const tile = size === 'lg' ? 56 : 40;
  return (
    <div className="flex flex-col items-center" aria-label="EASY JAWI">
      <div className="flex gap-1.5" dir="rtl" aria-hidden="true">
        {LETTERS.map((l, i) => (
          <motion.div
            key={l.ch}
            style={{ width: tile, height: tile }}
            initial={animate ? { y: -60, opacity: 0, rotate: -8 } : false}
            animate={{ y: 0, opacity: 1, rotate: i % 2 ? 3 : -3 }}
            transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.1 + i * 0.09 }}
          >
            <TileFace letter={l.ch} value={l.v} size={tile} />
          </motion.div>
        ))}
      </div>
      <motion.div
        className={`mt-3 font-display leading-none font-bold tracking-wide text-navy-900 ${size === 'lg' ? 'text-5xl' : 'text-3xl'}`}
        initial={animate ? { scale: 0.8, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 20 }}
      >
        EASY <span className="text-jade-600">JAWI</span>
      </motion.div>
    </div>
  );
}

export const TAGLINE = 'Susun Huruf, Bina Perkataan, Jadi Juara!';
