import { CATEGORY_LABELS, type Lexicon } from '../engine/dictionary';
import { splitLetters } from '../engine/jawi';
import { JawiText } from './JawiText';
import { Sheet } from './Sheet';

const REVIEW = {
  'ai-ok': { label: 'Ejaan disemak (AI)', cls: 'bg-cream-200 text-ink-soft' },
  'ai-fixed': { label: 'Ejaan dibetulkan selepas semakan', cls: 'bg-cream-200 text-ink-soft' },
  'ai-doubt': { label: 'Ejaan perlu disahkan guru', cls: 'bg-coral-100 text-coral-700' },
} as const;

const DIFF_LABEL = { 1: 'Asas (Darjah 1–2)', 2: 'Sederhana (Darjah 3–4)', 3: 'Mencabar (Darjah 5–6)' } as const;

/** Definition card: connected Jawi, Rumi, meaning, category, example. */
export function WordDetail({ word, lexicon, onClose }: { word: string | null; lexicon: Lexicon; onClose: () => void }) {
  const entries = word ? lexicon.lookup(word) : [];
  return (
    <Sheet open={!!word} onClose={onClose} title="Makna perkataan">
      {word && (
        <div data-testid="word-detail">
          <div className="mb-3 rounded-2xl bg-navy-800 px-4 py-3 text-center text-white">
            <JawiText text={word} className="block text-5xl leading-[1.6] font-bold" />
            <div className="mt-1 flex flex-wrap justify-center gap-1" aria-label="Huruf satu per satu" dir="rtl">
              {splitLetters(word).map((ch, i) => (
                <span key={i} lang="ms-Arab" className="rounded-md bg-white/15 px-1.5 font-jawi text-lg">
                  {ch}
                </span>
              ))}
            </div>
          </div>
          {entries.length === 0 && <p className="text-ink-soft">Perkataan ini tiada dalam kamus.</p>}
          {entries.map((e) => (
            <div key={e.id} className="mb-3 last:mb-0">
              <div className="font-display text-2xl font-semibold text-navy-900">{e.rumi}</div>
              <p className="mt-1 text-lg">{e.meaningMs}</p>
              {e.example && <p className="mt-2 rounded-xl bg-cream-200 px-3 py-2 text-ink-soft italic">“{e.example}”</p>}
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
                <span className="rounded-full bg-jade-100 px-2 py-1 text-jade-700">{CATEGORY_LABELS[e.category] ?? e.category}</span>
                <span className="rounded-full bg-mango-100 px-2 py-1 text-mango-600">{DIFF_LABEL[e.difficulty]}</span>
                {e.pack && e.pack !== 'teras' && <span className="rounded-full bg-navy-100 px-2 py-1 text-navy-800">Pek: {e.pack}</span>}
                {e.review && <span className={`rounded-full px-2 py-1 ${REVIEW[e.review].cls}`}>{REVIEW[e.review].label}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
