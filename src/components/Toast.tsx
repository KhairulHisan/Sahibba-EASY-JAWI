import { AnimatePresence, motion } from 'motion/react';
import { create } from 'zustand';
import type { ReactNode } from 'react';

export interface ToastItem {
  id: number;
  tone: 'jade' | 'coral' | 'navy' | 'mango';
  content: ReactNode;
  onClick?: () => void;
}

interface ToastStore {
  items: ToastItem[];
  push: (t: Omit<ToastItem, 'id'>, ms?: number) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
export const useToasts = create<ToastStore>()((set, get) => ({
  items: [],
  push: (t, ms = 2600) => {
    const id = ++seq;
    set((s) => ({ items: [...s.items.slice(-2), { ...t, id }] }));
    window.setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export const toast = (t: Omit<ToastItem, 'id'>, ms?: number) => useToasts.getState().push(t, ms);

const TONE = {
  jade: 'bg-jade-500 text-white',
  coral: 'bg-coral-500 text-white',
  navy: 'bg-navy-800 text-white',
  mango: 'bg-mango-400 text-ink',
};

export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.25rem)] z-[60] flex flex-col items-center gap-2 px-3" aria-live="polite">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            className={`pointer-events-auto max-w-md rounded-2xl px-4 py-2.5 font-semibold shadow-lg ${TONE[t.tone]}`}
            role="status"
          >
            {t.onClick ? (
              <button type="button" className="w-full text-left" onClick={t.onClick}>
                {t.content}
              </button>
            ) : (
              t.content
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
