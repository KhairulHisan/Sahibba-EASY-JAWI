import { motion } from 'motion/react';
import { Logo, TAGLINE } from '../components/Logo';
import { Icon, type IconName } from '../components/Icon';
import { BOT_PERSONA, useSingle } from '../features/single/store';
import { fx } from '../lib/feedback';
import { navigate, type Route } from '../state/router';
import { useSettings } from '../state/settings';

export function Home() {
  const game = useSingle((s) => s.game);
  const seenTutorial = useSettings((s) => s.seenTutorial);
  const resumable = game && game.phase === 'active';
  const go = (r: Route) => {
    fx('button-tap');
    navigate(r);
  };
  return (
    <div className="app-bg min-h-full overflow-y-auto" data-testid="home">
      <main className="safe-top mx-auto flex max-w-xl flex-col gap-4 px-4 pt-6 pb-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo size="md" animate={false} />
          <p className="font-display text-lg text-ink-soft">{TAGLINE}</p>
        </div>

        {resumable && (
          <motion.button
            type="button"
            onClick={() => go('game')}
            className="card flex min-h-16 items-center gap-3 border-jade-500! bg-jade-100! px-4 py-3 text-left"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            data-testid="resume-game"
          >
            <span className="grid size-11 place-items-center rounded-full bg-jade-500 text-white">
              <Icon name="play" />
            </span>
            <span className="flex-1">
              <span className="block font-display text-lg font-semibold text-jade-700">Sambung permainan</span>
              <span className="text-sm text-ink-soft">
                Menentang {BOT_PERSONA[game.difficulty].name} · giliran {game.turn} · {game.players.map((p) => p.score).join(' – ')}
              </span>
            </span>
          </motion.button>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <ModeCard
            title="SINGLE PLAYER"
            desc="Lawan bot luar talian: MUDAH, SEDERHANA atau SUKAR."
            icon="user"
            tone="bg-navy-800 text-white"
            onClick={() => go('single')}
            testId="mode-single"
          />
          <ModeCard
            title="MULTIPLAYER"
            desc="2–4 pemain di peranti berasingan. Belum disambungkan ke pelayan."
            icon="users"
            tone="bg-cream-50 text-ink border-2 border-cream-300"
            onClick={() => go('multi')}
            badge="Fasa 3"
            testId="mode-multi"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SmallCard icon="info" label="Cara Bermain" onClick={() => go('tutorial')} dot={!seenTutorial} />
          <SmallCard icon="book" label="Kamus Jawi" onClick={() => go('kamus')} />
          <SmallCard icon="history" label="Sejarah" onClick={() => go('sejarah')} />
          <SmallCard icon="gear" label="Tetapan" onClick={() => go('tetapan')} />
        </div>
        <button type="button" onClick={() => go('guru')} className="mx-auto flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold text-navy-700 hover:bg-cream-200">
          <Icon name="school" size={18} /> Mod Guru: import pek perkataan
        </button>
      </main>
    </div>
  );
}

function ModeCard({ title, desc, icon, tone, onClick, badge, testId }: { title: string; desc: string; icon: IconName; tone: string; onClick: () => void; badge?: string; testId: string }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className={`btn-3d relative flex min-h-32 flex-col items-start justify-end gap-1 rounded-3xl p-5 text-left ${tone}`}
      data-testid={testId}
    >
      {badge && <span className="absolute top-3 right-3 rounded-full bg-mango-400 px-2 py-0.5 text-xs font-extrabold text-ink">{badge}</span>}
      <Icon name={icon} size={34} />
      <span className="font-display text-2xl font-bold tracking-wide">{title}</span>
      <span className="text-sm opacity-85">{desc}</span>
    </motion.button>
  );
}

function SmallCard({ icon, label, onClick, dot }: { icon: IconName; label: string; onClick: () => void; dot?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="card relative flex min-h-20 flex-col items-center justify-center gap-1 p-3 font-display font-semibold text-navy-800 hover:bg-white">
      {dot && <span className="absolute top-2 right-2 size-2.5 rounded-full bg-coral-500" aria-label="baharu" />}
      <Icon name={icon} size={26} />
      {label}
    </button>
  );
}
