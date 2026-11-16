import { AnimatePresence, motion } from 'motion/react';
import type { PlayEvaluation } from '../engine/game';
import { JawiText } from './JawiText';
import { Icon } from './Icon';

/**
 * Live preview of the move being built: properly joined Jawi (RTL, shaped by
 * the browser), the projected score, and a specific Malay explanation when the
 * move is not yet legal.
 */
export function WordPreview({
  evaluation,
  isYourTurn,
  waiting,
  lastWord,
  onShowWord,
}: {
  evaluation: PlayEvaluation | null;
  isYourTurn: boolean;
  waiting: string | null;
  lastWord: { text: string; score: number; who: string } | null;
  onShowWord: (text: string) => void;
}) {
  let body;
  let key: string;
  if (waiting) {
    key = 'wait';
    body = (
      <div className="flex items-center gap-2 text-ink-soft">
        <span className="flex gap-1" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <motion.span key={i} className="size-2 rounded-full bg-navy-700" animate={{ y: [0, -5, 0] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12 }} />
          ))}
        </span>
        <span className="font-semibold">{waiting}</span>
      </div>
    );
  } else if (evaluation?.ok) {
    key = 'ok';
    const main = evaluation.words.find((w) => w.isMain) ?? evaluation.words[0]!;
    const others = evaluation.words.filter((w) => w !== main);
    body = (
      <div className="flex w-full items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <JawiText text={main.text} className="text-3xl leading-[1.5] font-bold text-jade-700" data-testid="preview-word" />
            {others.map((w) => (
              <JawiText key={w.cells.map((c) => `${c.x},${c.y}`).join()} text={w.text} className="text-xl leading-[1.5] text-jade-600" />
            ))}
          </div>
          <div className="text-xs font-bold text-jade-700">
            {evaluation.words.length > 1 ? `${evaluation.words.length} perkataan` : 'Sah'}
            {evaluation.allTilesBonus > 0 && ' · Bonus 7 jubin +' + evaluation.allTilesBonus}
          </div>
        </div>
        <div className="shrink-0 rounded-xl bg-jade-500 px-3 py-1 font-display text-2xl font-bold text-white" data-testid="preview-score">
          +{evaluation.score}
        </div>
      </div>
    );
  } else if (evaluation && !evaluation.ok) {
    key = 'err-' + evaluation.error.code;
    const unknown = evaluation.error.code === 'UNKNOWN_WORD';
    body = (
      <div className="flex w-full items-start gap-2 text-coral-700" role="status">
        <Icon name="info" className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          {unknown ? (
            <>
              <div className="font-bold">Ejaan belum ditemui dalam kamus</div>
              <div className="flex flex-wrap gap-2">
                {evaluation.error.words?.map((w) => <JawiText key={w} text={w} className="text-2xl leading-[1.5] font-bold" />)}
              </div>
            </>
          ) : (
            <div className="font-bold" data-testid="preview-error">
              {evaluation.error.message}
            </div>
          )}
        </div>
      </div>
    );
  } else if (isYourTurn) {
    key = 'turn';
    body = (
      <div className="flex w-full items-center justify-between gap-2">
        <span className="font-display text-lg font-semibold text-navy-800">Giliran Anda!</span>
        {lastWord && <LastWord lastWord={lastWord} onShowWord={onShowWord} />}
      </div>
    );
  } else {
    key = 'idle';
    body = lastWord ? <LastWord lastWord={lastWord} onShowWord={onShowWord} /> : <span className="text-ink-soft">Menunggu pemain…</span>;
  }
  return (
    <div className="relative flex min-h-[64px] items-center rounded-2xl border-2 border-cream-300 bg-cream-50 px-3 py-1.5" aria-live="polite" data-testid="word-preview">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={key} className="flex w-full" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
          {body}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function LastWord({ lastWord, onShowWord }: { lastWord: { text: string; score: number; who: string }; onShowWord: (t: string) => void }) {
  return (
    <button type="button" onClick={() => onShowWord(lastWord.text)} className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-left hover:bg-cream-200" aria-label={`Perkataan terakhir oleh ${lastWord.who}, ${lastWord.score} mata. Ketik untuk makna.`}>
      <span className="text-xs font-bold text-ink-soft">{lastWord.who}:</span>
      <JawiText text={lastWord.text} className="text-2xl leading-[1.5] font-bold text-navy-800" />
      <span className="rounded-lg bg-navy-100 px-1.5 text-sm font-bold text-navy-800">+{lastWord.score}</span>
    </button>
  );
}
