import { useDeferredValue, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { JawiText } from '../components/JawiText';
import { ScreenHeader } from '../components/ScreenHeader';
import { WordDetail } from '../components/WordDetail';
import { LEXICON_FILE } from '../data';
import { CATEGORY_LABELS } from '../engine/dictionary';
import { useBrowseLexicon } from '../state/lexicon';

export function Dictionary() {
  const lexicon = useBrowseLexicon();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('');
  const [diff, setDiff] = useState<number>(0);
  const [word, setWord] = useState<string | null>(null);
  const dq = useDeferredValue(q);
  const results = useMemo(
    () => lexicon.search(dq, cat || undefined).filter((e) => !diff || e.difficulty === diff).sort((a, b) => a.rumi.localeCompare(b.rumi, 'ms')),
    [lexicon, dq, cat, diff],
  );
  const cats = Object.keys(CATEGORY_LABELS);

  return (
    <div className="app-bg min-h-full overflow-y-auto" data-testid="dictionary">
      <ScreenHeader title="Kamus Jawi" />
      <main className="mx-auto flex max-w-2xl flex-col gap-3 px-4 pb-10">
        <p className="rounded-2xl bg-mango-100 px-4 py-2 text-sm" role="note">
          <b>{LEXICON_FILE.meta.name}</b> · {lexicon.size} perkataan. {LEXICON_FILE.meta.reviewStatusMs}
        </p>
        <label className="relative block">
          <span className="sr-only">Cari perkataan</span>
          <Icon name="search" className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-soft" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari Rumi, Jawi atau makna…"
            className="min-h-12 w-full rounded-xl border-2 border-cream-300 bg-white pr-3 pl-11 text-lg"
            data-testid="dict-search"
          />
        </label>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Tapis kategori">
          <Chip on={!cat} onClick={() => setCat('')}>
            Semua
          </Chip>
          {cats.map((c) => (
            <Chip key={c} on={cat === c} onClick={() => setCat(cat === c ? '' : c)}>
              {CATEGORY_LABELS[c]}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2" role="group" aria-label="Tapis tahap">
          {[0, 1, 2, 3].map((d) => (
            <Chip key={d} on={diff === d} onClick={() => setDiff(d)}>
              {d === 0 ? 'Semua tahap' : `Tahap ${d}`}
            </Chip>
          ))}
        </div>
        <p className="text-sm text-ink-soft" aria-live="polite">
          {results.length} hasil
        </p>
        {results.length === 0 ? (
          <div className="card p-6 text-center text-ink-soft">Tiada perkataan sepadan. Cuba ejaan lain.</div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {results.slice(0, 200).map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setWord(e.jawi)} className="card flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left hover:bg-white">
                  <JawiText text={e.jawi} className="w-28 shrink-0 text-right text-3xl leading-[1.5] font-bold text-navy-800" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-lg font-semibold">{e.rumi}</span>
                    <span className="block truncate text-sm text-ink-soft">{e.meaningMs}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {results.length > 200 && <p className="text-center text-sm text-ink-soft">Menunjukkan 200 pertama — perhalusi carian.</p>}
      </main>
      <WordDetail word={word} lexicon={lexicon} onClose={() => setWord(null)} />
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-11 shrink-0 rounded-full border-2 px-4 text-sm font-bold whitespace-nowrap ${on ? 'border-navy-800 bg-navy-800 text-white' : 'border-cream-300 bg-cream-50 text-ink'}`}
    >
      {children}
    </button>
  );
}
