import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { LexiconEntry } from '../engine/dictionary';

export interface WordPack {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: number;
  entries: LexiconEntry[];
}

interface PackStore {
  packs: WordPack[];
  addPack: (pack: WordPack) => void;
  togglePack: (id: string) => void;
  removePack: (id: string) => void;
}

export const usePacks = create<PackStore>()(
  persist(
    (set) => ({
      packs: [],
      addPack: (pack) => set((s) => ({ packs: [...s.packs.filter((p) => p.id !== pack.id), pack] })),
      togglePack: (id) => set((s) => ({ packs: s.packs.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)) })),
      removePack: (id) => set((s) => ({ packs: s.packs.filter((p) => p.id !== id) })),
    }),
    { name: 'easy-jawi:packs:v1', storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);
