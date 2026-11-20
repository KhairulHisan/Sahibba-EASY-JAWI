import { motion } from 'motion/react';
import { letterInfo } from '../engine/jawi';

export type TileState = 'ok' | 'error' | 'neutral';

export interface TileViewProps {
  letter: string;
  value: number;
  isBlank?: boolean;
  size: number;
  selected?: boolean;
  state?: TileState;
  pending?: boolean;
  highlight?: boolean;
  dim?: boolean;
  showName?: boolean;
  /** One-shot animation; change `key` to replay. */
  anim?: { kind: 'wobble' | 'wave'; key: number; delay?: number } | null;
}

/** Visual tile face. Letters are rendered in isolation (single code point). */
export function TileFace({ letter, value, isBlank, size, selected, state = 'neutral', pending, highlight, dim, showName, anim }: TileViewProps) {
  const ring =
    state === 'error'
      ? 'ring-[3px] ring-coral-500'
      : state === 'ok'
        ? 'ring-[3px] ring-jade-500'
        : selected
          ? 'ring-[3px] ring-mango-500'
          : highlight
            ? 'ring-2 ring-jade-500/80'
            : pending
              ? 'ring-2 ring-mango-400'
              : '';
  const name = letter ? letterInfo(letter)?.name : undefined;
  return (
    <motion.div
      key={anim ? `${anim.kind}-${anim.key}` : 'still'}
      className={`relative grid h-full w-full select-none place-items-center ${isBlank ? 'tile-face-blank' : 'tile-face'} ${ring} ${dim ? 'opacity-40' : ''}`}
      style={{ borderRadius: Math.max(5, size * 0.16) }}
      animate={anim?.kind === 'wobble' ? { x: [0, -5, 5, -3, 3, 0] } : anim?.kind === 'wave' ? { scale: [1, 1.14, 1], y: [0, -3, 0] } : undefined}
      transition={anim?.kind === 'wobble' ? { duration: 0.24 } : anim?.kind === 'wave' ? { duration: 0.24, delay: anim.delay ?? 0, ease: 'easeOut' } : undefined}
    >
      <span
        lang="ms-Arab"
        dir="rtl"
        className={`font-jawi leading-none font-bold ${isBlank ? 'text-coral-600' : 'text-tile-ink'}`}
        style={{ fontSize: size * (showName ? 0.5 : 0.58), transform: `translateY(${size * (showName ? -0.1 : -0.04)}px)` }}
      >
        {letter || (isBlank ? '؟' : '')}
      </span>
      <span
        className="absolute font-sans font-extrabold text-ink-soft"
        style={{ fontSize: Math.max(8, size * 0.22), left: size * 0.09, bottom: size * 0.04, lineHeight: 1 }}
        aria-hidden="true"
      >
        {isBlank ? '0' : value}
      </span>
      {isBlank && (
        <span
          className="absolute rounded-full bg-coral-500"
          style={{ width: size * 0.13, height: size * 0.13, right: size * 0.1, top: size * 0.1 }}
          aria-hidden="true"
        />
      )}
      {showName && (
        <span className="absolute font-sans font-bold text-ink-soft" style={{ fontSize: Math.max(8, size * 0.18), bottom: size * 0.05, right: size * 0.1 }} aria-hidden="true">
          {isBlank && !letter ? 'joker' : name}
        </span>
      )}
    </motion.div>
  );
}

export function tileAriaLabel(letter: string, value: number, isBlank: boolean): string {
  if (isBlank) return letter ? `Joker sebagai huruf ${letterInfo(letter)?.name ?? letter}, 0 mata` : 'Jubin joker, 0 mata';
  return `Huruf ${letterInfo(letter)?.name ?? letter}, ${value} mata`;
}
