import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Placement } from '../../engine/types';

/**
 * Local convenience only (which room to reconnect to, unsent draft, rack
 * order, hints used). The server is the source of truth for everything else.
 */
interface MpSession {
  roomId: string | null;
  code: string | null;
  nickname: string;
  drafts: Record<string, Placement[]>;
  rackOrders: Record<string, string[]>;
  hintsUsed: Record<string, number>;
  enter: (roomId: string, code: string, nickname: string) => void;
  leave: () => void;
  setDraft: (roomId: string, draft: Placement[]) => void;
  setRackOrder: (roomId: string, order: string[]) => void;
  useHint: (roomId: string) => void;
}

const pick = <T>(m: Record<string, T>, key: string): Record<string, T> => (key in m ? { [key]: m[key]! } : {});

export const useMpSession = create<MpSession>()(
  persist(
    (set) => ({
      roomId: null,
      code: null,
      nickname: '',
      drafts: {},
      rackOrders: {},
      hintsUsed: {},
      // Per-room scratch data is only kept for the room being entered.
      enter: (roomId, code, nickname) =>
        set((s) => ({
          roomId,
          code,
          nickname,
          drafts: pick(s.drafts, roomId),
          rackOrders: pick(s.rackOrders, roomId),
          hintsUsed: pick(s.hintsUsed, roomId),
        })),
      leave: () => set({ roomId: null, code: null }),
      setDraft: (roomId, draft) => set((s) => ({ drafts: { ...s.drafts, [roomId]: draft } })),
      setRackOrder: (roomId, order) => set((s) => ({ rackOrders: { ...s.rackOrders, [roomId]: order } })),
      useHint: (roomId) => set((s) => ({ hintsUsed: { ...s.hintsUsed, [roomId]: (s.hintsUsed[roomId] ?? 0) + 1 } })),
    }),
    { name: 'easy-jawi:mp:v1', storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);
