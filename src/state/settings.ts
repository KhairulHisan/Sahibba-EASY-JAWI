import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type MotionPref = 'system' | 'reduce' | 'full';

export interface Settings {
  soundOn: boolean;
  volume: number;
  hapticsOn: boolean;
  motion: MotionPref;
  /** Parent/teacher control: turn timers off everywhere. */
  timersAllowed: boolean;
  /** Show the Malay letter name under rack tiles (learning aid). */
  showLetterNames: boolean;
  playerName: string;
  seenTutorial: boolean;
  /** Smart Online Jawi Dictionary for Single Player (needs Internet). Off by default. */
  smartDictionary: boolean;
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export const DEFAULT_SETTINGS: Settings = {
  soundOn: true,
  volume: 0.7,
  hapticsOn: true,
  motion: 'system',
  timersAllowed: true,
  showLetterNames: false,
  playerName: 'Pemain',
  seenTutorial: false,
  smartDictionary: false,
};

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    { name: 'easy-jawi:settings:v1', storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);

export { sanitizeNickname } from '../lib/nickname';
