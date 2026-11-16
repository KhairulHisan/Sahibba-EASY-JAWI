import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

/** Animated number (points count-up 400–700 ms). */
export function CountUp({ value, duration = 0.55, className }: { value: number; duration?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || prev.current === value) {
      setShown(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, { duration, ease: 'easeOut', onUpdate: (v) => setShown(Math.round(v)) });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration, reduce]);
  return <span className={className}>{shown}</span>;
}
