import { sound, type SoundId } from './audio';
import { useSettings } from '../state/settings';

const HAPTICS: Partial<Record<SoundId, number | number[]>> = {
  'tile-pickup': 8,
  'tile-drop': 12,
  'word-valid': [15, 40, 25],
  'word-invalid': [30, 50, 30],
  'multi-word-combo': [15, 30, 15, 30, 35],
  'turn-start': 20,
  'countdown-warning': [20, 80, 20],
  'game-win': [30, 60, 30, 60, 80],
  error: [40, 60, 40],
};

function syncSettings() {
  const s = useSettings.getState();
  sound.enabled = s.soundOn;
  sound.setVolume(s.volume);
}
syncSettings();
useSettings.subscribe(syncSettings);

/** Play a sound and the matching (optional) haptic pulse. */
export function fx(id: SoundId) {
  sound.play(id);
  const pattern = HAPTICS[id];
  if (pattern !== undefined && useSettings.getState().hapticsOn && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* unsupported */
    }
  }
}

/** Install once: unlock audio on the first user gesture. */
export function installAudioUnlock() {
  const unlock = () => {
    sound.unlock();
    if (sound.unlocked) {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    }
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}
