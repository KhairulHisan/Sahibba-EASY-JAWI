import { motion } from 'motion/react';
import { useEffect } from 'react';
import { Logo, TAGLINE } from '../components/Logo';
import { sound } from '../lib/audio';
import { fx } from '../lib/feedback';
import { navigate } from '../state/router';

export function Splash() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') start();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const start = () => {
    sound.unlock();
    window.setTimeout(() => fx('ready-up'), 60);
    navigate('home');
  };
  return (
    <button
      type="button"
      onClick={start}
      className="flex h-full w-full flex-col items-center justify-center gap-6 bg-navy-800 px-6 text-center text-white"
      aria-label="EASY JAWI. Ketik untuk mula."
      data-testid="splash"
    >
      <div className="rounded-[2rem] bg-cream-100 px-8 py-7 shadow-[0_8px_0_#071a35]">
        <Logo />
      </div>
      <motion.p className="font-display text-xl font-medium text-mango-200" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
        {TAGLINE}
      </motion.p>
      <motion.span
        className="rounded-full bg-mango-400 px-6 py-3 font-display text-lg font-semibold text-ink"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.75, 1] }}
        transition={{ delay: 1.1, duration: 1.2 }}
      >
        Ketik untuk mula
      </motion.span>
    </button>
  );
}
