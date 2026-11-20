const TONES = {
  navy: 'bg-navy-700 text-white',
  jade: 'bg-jade-500 text-white',
  mango: 'bg-mango-400 text-ink',
  coral: 'bg-coral-500 text-white',
} as const;

export function Avatar({ initial, tone, size = 36 }: { initial: string; tone: keyof typeof TONES; size?: number }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-display font-bold ring-2 ring-white ${TONES[tone]}`}
      style={{ width: size, height: size, fontSize: size * 0.46 }}
      aria-hidden="true"
    >
      {initial.toUpperCase()}
    </span>
  );
}
