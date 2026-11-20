import { motion } from 'motion/react';
import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import type { Difficulty } from '../engine/types';
import { BOT_PERSONA, useSingle } from '../features/single/store';
import { fx } from '../lib/feedback';
import { enabledPackIds } from '../state/lexicon';
import { navigate } from '../state/router';
import { sanitizeNickname, useSettings } from '../state/settings';
import { usePacks } from '../state/teacherPacks';

const LEVELS: { id: Difficulty; label: string }[] = [
  { id: 'mudah', label: 'MUDAH' },
  { id: 'sederhana', label: 'SEDERHANA' },
  { id: 'sukar', label: 'SUKAR' },
];

const TIMER_OPTIONS: Record<Difficulty, (number | null)[]> = {
  mudah: [null],
  sederhana: [null, 120, 90],
  sukar: [null, 90, 60],
};

export function DifficultySelect() {
  const settings = useSettings();
  const startGame = useSingle((s) => s.startGame);
  const existing = useSingle((s) => s.game);
  const allPacks = usePacks((s) => s.packs);
  const packs = allPacks.filter((p) => p.enabled);
  const [level, setLevel] = useState<Difficulty>('mudah');
  const [timer, setTimer] = useState<number | null>(null);
  const [name, setName] = useState(settings.playerName);
  const timerChoices = settings.timersAllowed ? TIMER_OPTIONS[level] : [null];

  const start = () => {
    const clean = sanitizeNickname(name);
    settings.set({ playerName: clean });
    startGame({ difficulty: level, playerName: clean, turnSeconds: timerChoices.includes(timer) ? timer : null, packIds: enabledPackIds() });
    fx('ready-up');
    navigate('game', { replace: true });
  };

  return (
    <div className="app-bg min-h-full overflow-y-auto">
      <ScreenHeader title="Single Player" />
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-10">
        {existing?.phase === 'active' && (
          <p className="rounded-2xl bg-mango-100 px-4 py-3 text-sm font-semibold text-ink">
            Anda ada permainan yang belum tamat. Memulakan permainan baharu akan menggantikannya.
          </p>
        )}
        <section aria-labelledby="lvl">
          <h2 id="lvl" className="mb-2 font-display text-lg font-semibold">
            Pilih tahap
          </h2>
          <div className="grid gap-3" role="radiogroup" aria-label="Tahap kesukaran">
            {LEVELS.map((l) => {
              const p = BOT_PERSONA[l.id];
              const on = level === l.id;
              return (
                <motion.button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    fx('button-tap');
                    setLevel(l.id);
                    setTimer(null);
                  }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex min-h-20 items-center gap-3 rounded-2xl border-[3px] px-4 py-3 text-left transition-colors ${on ? 'border-navy-800 bg-white' : 'border-cream-300 bg-cream-50'}`}
                  data-testid={`level-${l.id}`}
                >
                  <Avatar initial={p.initial} tone={p.tone} size={44} />
                  <span className="flex-1">
                    <span className="block font-display text-xl font-bold tracking-wide">{l.label}</span>
                    <span className="block text-sm font-semibold text-navy-700">Lawan: {p.name}</span>
                    <span className="block text-sm text-ink-soft">{p.blurb}</span>
                  </span>
                  <span className={`grid size-7 place-items-center rounded-full border-[3px] ${on ? 'border-navy-800' : 'border-cream-300'}`} aria-hidden="true">
                    {on && <span className="size-3 rounded-full bg-navy-800" />}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="tmr">
          <h2 id="tmr" className="mb-2 font-display text-lg font-semibold">
            Pemasa giliran
          </h2>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Pemasa giliran">
            {timerChoices.map((t) => (
              <button
                key={String(t)}
                type="button"
                role="radio"
                aria-checked={timer === t}
                onClick={() => setTimer(t)}
                className={`min-h-11 rounded-full border-2 px-4 font-bold ${timer === t ? 'border-navy-800 bg-navy-800 text-white' : 'border-cream-300 bg-cream-50'}`}
              >
                {t === null ? 'Tiada pemasa' : `${t} saat`}
              </button>
            ))}
          </div>
          {!settings.timersAllowed && <p className="mt-1 text-sm text-ink-soft">Pemasa dimatikan dalam Tetapan (kawalan ibu bapa/guru).</p>}
          {level === 'mudah' && settings.timersAllowed && <p className="mt-1 text-sm text-ink-soft">Tahap MUDAH tiada pemasa — main dengan santai.</p>}
        </section>

        <section>
          <label htmlFor="nick" className="mb-2 block font-display text-lg font-semibold">
            Nama panggilan
          </label>
          <input
            id="nick"
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            className="min-h-12 w-full rounded-xl border-2 border-cream-300 bg-white px-4 text-lg font-semibold focus:border-navy-700"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-ink-soft">Disimpan pada peranti ini sahaja. Huruf, nombor dan ruang sahaja.</p>
        </section>

        {packs.length > 0 && (
          <p className="rounded-2xl bg-navy-100 px-4 py-3 text-sm">
            Pek guru aktif: <b>{packs.map((p) => p.name).join(', ')}</b> — perkataan ini turut diterima.
          </p>
        )}

        <Button tone="jade" size="lg" icon="play" onClick={start} data-testid="start-game">
          MULA BERMAIN
        </Button>
      </main>
    </div>
  );
}
