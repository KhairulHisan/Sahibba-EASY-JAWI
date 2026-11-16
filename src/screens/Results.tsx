import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Confetti } from '../components/Confetti';
import { CountUp } from '../components/CountUp';
import { JawiText } from '../components/JawiText';
import { WordDetail } from '../components/WordDetail';
import { activeLexicon } from '../features/single/controller';
import { BOT_PERSONA, HUMAN_ID, useSingle } from '../features/single/store';
import { fx } from '../lib/feedback';
import { navigate } from '../state/router';

const REASON: Record<string, string> = {
  'rack-out': 'Beg kosong dan seorang pemain menghabiskan jubin.',
  scoreless: 'Tiga pusingan berturut-turut tanpa mata.',
  resign: 'Seorang pemain menyerah kalah.',
};

export function Results() {
  const game = useSingle((s) => s.game);
  const startGame = useSingle((s) => s.startGame);
  const turnSeconds = useSingle((s) => s.turnSeconds);
  const packIds = useSingle((s) => s.packIds);
  const [burst, setBurst] = useState(0);
  const [word, setWord] = useState<string | null>(null);
  const lexicon = useMemo(() => activeLexicon(), []);

  const result = game?.result;
  const youWon = !!result?.winners.includes(HUMAN_ID);
  const outcome = !result ? null : result.isTie && youWon ? 'seri' : youWon ? 'menang' : 'kalah';

  useEffect(() => {
    if (!outcome) return;
    const t = window.setTimeout(() => {
      fx(outcome === 'menang' ? 'game-win' : outcome === 'seri' ? 'tie' : 'game-lose');
      if (outcome !== 'kalah') setBurst(Date.now());
    }, 250);
    const t2 = window.setTimeout(() => fx('final-score'), 1100);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, [outcome]);

  if (!game || !result) {
    return (
      <div className="app-bg grid h-full place-items-center p-6 text-center">
        <div>
          <p className="mb-4 text-ink-soft">Tiada keputusan untuk dipaparkan.</p>
          <Button tone="navy" icon="home" onClick={() => navigate('home')}>
            Laman Utama
          </Button>
        </div>
      </div>
    );
  }

  const persona = BOT_PERSONA[game.difficulty];
  const ranked = [...game.players].sort((a, b) => b.score - a.score);
  const words = game.moves.filter((m) => m.type === 'play').flatMap((m) => m.words.map((w) => ({ ...w, playerId: m.playerId })));
  const best = [...words].filter((w) => w.playerId === HUMAN_ID).sort((a, b) => b.score - a.score)[0];
  const uniqueWords = [...new Set(words.map((w) => w.text))];

  const title = outcome === 'menang' ? 'Tahniah, Juara EASY JAWI!' : outcome === 'seri' ? 'Seri! Juara bersama!' : `${persona.name} menang kali ini`;
  const sub = outcome === 'kalah' ? 'Jangan putus asa — cuba lagi dan belajar perkataan baharu!' : 'Susun Huruf, Bina Perkataan, Jadi Juara!';

  return (
    <div className="app-bg min-h-full overflow-y-auto" data-testid="results">
      <Confetti burstKey={burst} />
      <main className="safe-top mx-auto flex max-w-xl flex-col gap-4 px-4 pt-6 pb-10">
        <motion.div
          className={`rounded-3xl px-5 py-6 text-center shadow-[0_6px_0_rgb(0_0_0/0.15)] ${outcome === 'kalah' ? 'bg-navy-800 text-white' : 'bg-mango-400 text-ink'}`}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        >
          <div className="text-5xl" aria-hidden="true">
            {outcome === 'menang' ? '🏆' : outcome === 'seri' ? '🤝' : '🌱'}
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold" data-testid="result-title">
            {title}
          </h1>
          <p className="mt-1 opacity-85">{sub}</p>
          <p className="mt-2 text-sm font-semibold opacity-80">Sebab tamat: {REASON[result.reason]}</p>
        </motion.div>

        <section className="card p-4" aria-label="Markah akhir">
          <h2 className="mb-3 font-display text-lg font-semibold">Markah akhir</h2>
          <ol className="grid gap-2">
            {ranked.map((p, i) => {
              const isYou = p.id === HUMAN_ID;
              const winner = result.winners.includes(p.id);
              return (
                <motion.li
                  key={p.id}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${winner ? 'bg-jade-100' : 'bg-cream-200'}`}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.3 + i * 0.12 }}
                >
                  <span className="w-6 text-center font-display text-xl font-bold">{i + 1}</span>
                  <Avatar initial={isYou ? p.name.slice(0, 1) : persona.initial} tone={isYou ? 'navy' : persona.tone} />
                  <span className="flex-1">
                    <span className="block font-bold">
                      {isYou ? `${p.name} (Anda)` : p.name} {winner && <span className="text-jade-700">★ Juara</span>}
                    </span>
                    <span className="text-xs text-ink-soft">
                      {p.resigned ? 'Menyerah' : p.endPenalty ? `Tolak baki jubin: −${p.endPenalty}` : 'Tiada baki jubin'}
                    </span>
                  </span>
                  <CountUp value={p.score} className="font-display text-3xl font-bold" duration={0.65} />
                </motion.li>
              );
            })}
          </ol>
        </section>

        <section className="card p-4">
          <h2 className="mb-2 font-display text-lg font-semibold">Perkataan dimainkan ({uniqueWords.length})</h2>
          {best && (
            <p className="mb-2 text-sm">
              Perkataan terbaik anda: <JawiText text={best.text} className="text-xl font-bold" /> (+{best.score})
            </p>
          )}
          <div className="flex flex-wrap gap-2" dir="rtl">
            {uniqueWords.map((w) => (
              <button key={w} type="button" onClick={() => setWord(w)} className="min-h-11 rounded-xl bg-white px-3 ring-2 ring-cream-300 hover:ring-navy-600">
                <JawiText text={w} className="text-xl font-bold" />
              </button>
            ))}
            {uniqueWords.length === 0 && <span className="text-ink-soft">Tiada perkataan dimainkan.</span>}
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            tone="jade"
            size="lg"
            icon="play"
            onClick={() => {
              startGame({ difficulty: game.difficulty, playerName: game.players.find((p) => p.id === HUMAN_ID)!.name, turnSeconds, packIds });
              navigate('game', { replace: true });
            }}
            data-testid="play-again"
          >
            Main Lagi
          </Button>
          <Button tone="navy" size="lg" icon="home" onClick={() => navigate('home', { replace: true })}>
            Laman Utama
          </Button>
        </div>
      </main>
      <WordDetail word={word} lexicon={lexicon} onClose={() => setWord(null)} />
    </div>
  );
}
