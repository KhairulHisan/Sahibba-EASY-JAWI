import { create } from 'zustand';
import { syncOrder } from '../play/rackOrder';
import { createJSONStorage, persist } from 'zustand/middleware';
import { TILE_DISTRIBUTION } from '../../data';
import { createGame } from '../../engine/game';
import { randomId, secureSeed } from '../../engine/rng';
import type { Difficulty, GameEvent, GameState, Placement } from '../../engine/types';

export const HUMAN_ID = 'anda';
export const BOT_ID = 'bot';

export const BOT_PERSONA: Record<Difficulty, { name: string; initial: string; tone: 'jade' | 'mango' | 'coral'; blurb: string }> = {
  mudah: { name: 'Adik Arnab', initial: 'A', tone: 'jade', blurb: 'Suka perkataan pendek & mudah. Bantuan tanpa had, tiada pemasa wajib.' },
  sederhana: { name: 'Sang Kancil', initial: 'K', tone: 'mango', blurb: 'Seimbang antara markah dan kosa kata. 3 bantuan, pemasa pilihan.' },
  sukar: { name: 'Helang Emas', initial: 'H', tone: 'coral', blurb: 'Strategik: kira bonus, rak & risiko papan. 1 bantuan, cabaran masa pilihan.' },
};

export const HINT_LIMIT: Record<Difficulty, number | null> = { mudah: null, sederhana: 3, sukar: 1 };

export interface AppliedNotice {
  nonce: number;
  event: GameEvent;
  byHuman: boolean;
}

interface SingleStore {
  game: GameState | null;
  draft: Placement[];
  rackOrder: string[];
  hintsUsed: number;
  turnSeconds: number | null;
  packIds: string[];
  recordedResult: boolean;
  /** Transient (not persisted): last applied event for animations/toasts. */
  notice: AppliedNotice | null;

  startGame: (opts: { difficulty: Difficulty; playerName: string; turnSeconds: number | null; packIds: string[] }) => void;
  setDraft: (draft: Placement[]) => void;
  setRackOrder: (ids: string[]) => void;
  commitState: (game: GameState, notice: Omit<AppliedNotice, 'nonce'> | null) => void;
  useHint: () => void;
  markRecorded: () => void;
  abandon: () => void;
}

/** Optional deterministic seed for demos/tests: …?seed=123 */
function seedFromUrl(): number | null {
  try {
    const q = new URLSearchParams(window.location.search || window.location.hash.split('?')[1] || '');
    const v = q.get('seed');
    return v && /^\d+$/.test(v) ? Number(v) >>> 0 : null;
  } catch {
    return null;
  }
}

export const useSingle = create<SingleStore>()(
  persist(
    (set, get) => ({
      game: null,
      draft: [],
      rackOrder: [],
      hintsUsed: 0,
      turnSeconds: null,
      packIds: [],
      recordedResult: false,
      notice: null,

      startGame: ({ difficulty, playerName, turnSeconds, packIds }) => {
        const game = createGame({
          id: randomId('sp-'),
          players: [
            { id: HUMAN_ID, name: playerName, kind: 'human' },
            { id: BOT_ID, name: BOT_PERSONA[difficulty].name, kind: 'bot', botLevel: difficulty },
          ],
          difficulty,
          distribution: TILE_DISTRIBUTION,
          seed: seedFromUrl() ?? secureSeed(),
        });
        set({
          game,
          draft: [],
          rackOrder: game.players[0]!.rack.map((t) => t.id),
          hintsUsed: 0,
          turnSeconds,
          packIds,
          recordedResult: false,
          notice: null,
        });
      },
      setDraft: (draft) => set({ draft }),
      setRackOrder: (rackOrder) => set({ rackOrder }),
      commitState: (game, notice) =>
        set((s) => ({
          game,
          notice: notice ? { ...notice, nonce: (s.notice?.nonce ?? 0) + 1 } : s.notice,
          rackOrder: syncOrder(game.players.find((p) => p.id === HUMAN_ID)?.rack ?? [], get().rackOrder),
        })),
      useHint: () => set((s) => ({ hintsUsed: s.hintsUsed + 1 })),
      markRecorded: () => set({ recordedResult: true }),
      abandon: () => set({ game: null, draft: [], rackOrder: [], notice: null, hintsUsed: 0, recordedResult: false }),
    }),
    {
      name: 'easy-jawi:single:v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: ({ notice: _notice, ...rest }) => rest,
    },
  ),
);

export { orderedRack, syncOrder } from '../play/rackOrder';
