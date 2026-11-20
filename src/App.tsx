import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useEffect } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineBadge } from './components/OfflineBadge';
import { Toaster } from './components/Toast';
import { installAudioUnlock } from './lib/feedback';
import { useRoute, type Route } from './state/router';
import { useSettings } from './state/settings';
import { DifficultySelect } from './screens/DifficultySelect';
import { Dictionary } from './screens/Dictionary';
import { DictionaryAdmin } from './screens/DictionaryAdmin';
import { GameScreen } from './screens/GameScreen';
import { HistoryScreen } from './screens/History';
import { Home } from './screens/Home';
import { RoomScreen } from './features/multiplayer/RoomScreen';
import { Multiplayer } from './screens/Multiplayer';
import { Results } from './screens/Results';
import { SettingsScreen } from './screens/Settings';
import { Splash } from './screens/Splash';
import { Teacher } from './screens/Teacher';
import { Tutorial } from './screens/Tutorial';

const SCREENS: Record<Route, () => React.ReactNode> = {
  splash: Splash,
  home: Home,
  single: DifficultySelect,
  game: GameScreen,
  results: Results,
  multi: Multiplayer,
  bilik: RoomScreen,
  tutorial: Tutorial,
  kamus: Dictionary,
  tetapan: SettingsScreen,
  sejarah: HistoryScreen,
  guru: Teacher,
  pentadbir: DictionaryAdmin,
};

const TITLES: Record<Route, string> = {
  splash: 'EASY JAWI',
  home: 'EASY JAWI — Laman Utama',
  single: 'Single Player — EASY JAWI',
  game: 'Permainan — EASY JAWI',
  results: 'Keputusan — EASY JAWI',
  multi: 'Multiplayer — EASY JAWI',
  bilik: 'Bilik — EASY JAWI',
  tutorial: 'Cara Bermain — EASY JAWI',
  kamus: 'Kamus Jawi — EASY JAWI',
  tetapan: 'Tetapan — EASY JAWI',
  sejarah: 'Sejarah — EASY JAWI',
  guru: 'Mod Guru — EASY JAWI',
  pentadbir: 'Pentadbir Kamus Online — EASY JAWI',
};

export function App() {
  const route = useRoute();
  const motionPref = useSettings((s) => s.motion);
  useEffect(() => installAudioUnlock(), []);
  useEffect(() => {
    document.title = TITLES[route];
  }, [route]);
  useEffect(() => {
    document.documentElement.dataset.motion = motionPref;
  }, [motionPref]);
  const Screen = SCREENS[route];
  return (
    <MotionConfig reducedMotion={motionPref === 'system' ? 'user' : motionPref === 'reduce' ? 'always' : 'never'}>
      <ErrorBoundary>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={route}
            className="h-full"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <Screen />
          </motion.div>
        </AnimatePresence>
      </ErrorBoundary>
      <Toaster />
      <OfflineBadge />
    </MotionConfig>
  );
}
