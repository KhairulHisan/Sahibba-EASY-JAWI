import { useState } from 'react';
import { Button } from '../components/Button';
import { JawiText } from '../components/JawiText';
import { ScreenHeader } from '../components/ScreenHeader';
import { ConfirmSheet } from '../components/Sheet';
import { downloadText } from '../lib/download';
import { historyToCsv, useHistory } from '../state/history';
import { navigate } from '../state/router';

const OUTCOME = {
  menang: { label: 'Menang', cls: 'bg-jade-500 text-white' },
  kalah: { label: 'Kalah', cls: 'bg-navy-700 text-white' },
  seri: { label: 'Seri', cls: 'bg-mango-400 text-ink' },
};
const LEVEL = { mudah: 'MUDAH', sederhana: 'SEDERHANA', sukar: 'SUKAR' };

export function HistoryScreen() {
  const matches = useHistory((s) => s.matches);
  const clear = useHistory((s) => s.clear);
  const [confirm, setConfirm] = useState(false);
  const wins = matches.filter((m) => m.outcome === 'menang').length;

  return (
    <div className="app-bg min-h-full overflow-y-auto" data-testid="history">
      <ScreenHeader title="Sejarah Perlawanan" />
      <main className="mx-auto flex max-w-xl flex-col gap-3 px-4 pb-10">
        {matches.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-ink-soft">Belum ada perlawanan yang tamat pada peranti ini.</p>
            <Button tone="jade" icon="play" onClick={() => navigate('single')}>
              Main sekarang
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Perlawanan" value={matches.length} />
              <Stat label="Menang" value={wins} />
              <Stat label="Markah terbaik" value={Math.max(...matches.map((m) => m.players.find((p) => p.isHuman)?.score ?? 0))} />
            </div>
            <ul className="grid gap-2">
              {matches.map((m) => {
                const you = m.players.find((p) => p.isHuman);
                const opp = m.players.find((p) => !p.isHuman);
                return (
                  <li key={m.id} className="card flex items-center gap-3 p-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${OUTCOME[m.outcome].cls}`}>{OUTCOME[m.outcome].label}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">
                        {you?.score} – {opp?.score} <span className="text-sm font-semibold text-ink-soft">lwn {opp?.name}</span>
                      </span>
                      <span className="block text-xs text-ink-soft">
                        {LEVEL[m.difficulty]} · {new Date(m.finishedAt).toLocaleString('ms-MY', { dateStyle: 'medium', timeStyle: 'short' })} · {m.wordsPlayed} perkataan
                      </span>
                    </span>
                    {m.bestWord && (
                      <span className="text-right">
                        <JawiText text={m.bestWord.text} className="block text-xl leading-[1.4] font-bold" />
                        <span className="text-xs text-ink-soft">+{m.bestWord.score}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="grid grid-cols-2 gap-2">
              <Button tone="cream" icon="download" onClick={() => downloadText('easy-jawi-sejarah.csv', historyToCsv(matches), 'text/csv')}>
                Eksport CSV
              </Button>
              <Button tone="coral" icon="trash" onClick={() => setConfirm(true)}>
                Kosongkan
              </Button>
            </div>
          </>
        )}
      </main>
      <ConfirmSheet
        open={confirm}
        title="Kosongkan sejarah?"
        message="Semua rekod perlawanan pada peranti ini akan dipadam."
        confirmLabel="Kosongkan"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          clear();
          setConfirm(false);
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card px-2 py-3">
      <div className="font-display text-2xl font-bold text-navy-800">{value}</div>
      <div className="text-xs font-bold text-ink-soft">{label}</div>
    </div>
  );
}
