import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Difficulty, EndReason } from '../engine/types';

export interface MatchRecord {
  id: string;
  finishedAt: number;
  difficulty: Difficulty;
  reason: EndReason;
  outcome: 'menang' | 'kalah' | 'seri';
  players: { name: string; score: number; isHuman: boolean }[];
  bestWord?: { text: string; score: number };
  wordsPlayed: number;
  turns: number;
}

interface HistoryStore {
  matches: MatchRecord[];
  add: (m: MatchRecord) => void;
  clear: () => void;
}

export const useHistory = create<HistoryStore>()(
  persist(
    (set) => ({
      matches: [],
      add: (m) => set((s) => (s.matches.some((x) => x.id === m.id) ? s : { matches: [m, ...s.matches].slice(0, 50) })),
      clear: () => set({ matches: [] }),
    }),
    { name: 'easy-jawi:history:v1', storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);

export function historyToCsv(matches: readonly MatchRecord[]): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['tarikh', 'tahap', 'keputusan', 'sebab_tamat', 'pemain', 'markah', 'perkataan_terbaik', 'markah_terbaik', 'perkataan_dimainkan', 'giliran']];
  for (const m of matches) {
    const human = m.players.find((p) => p.isHuman);
    rows.push([
      new Date(m.finishedAt).toISOString(),
      m.difficulty,
      m.outcome,
      m.reason,
      m.players.map((p) => p.name).join(' / '),
      human ? String(human.score) : '',
      m.bestWord?.text ?? '',
      String(m.bestWord?.score ?? ''),
      String(m.wordsPlayed),
      String(m.turns),
    ]);
  }
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}
