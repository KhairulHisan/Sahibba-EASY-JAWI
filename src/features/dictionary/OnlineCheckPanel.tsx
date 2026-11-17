import { motion } from 'motion/react';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { JawiText } from '../../components/JawiText';
import { STATUS_LABEL, type WordCheck, type WordStatus } from '../../dictionary/protocol';
import type { SuggestResult } from './firebaseBackend';

export type OnlineCheckState = { phase: 'checking'; words: string[] } | { phase: 'result'; checks: WordCheck[] };

const CHIP: Record<WordStatus, string> = {
  VALID: 'bg-jade-500 text-white',
  INVALID: 'bg-coral-500 text-white',
  NOT_FOUND: 'bg-mango-400 text-ink',
  PENDING_REVIEW: 'bg-navy-700 text-white',
  SERVICE_UNAVAILABLE: 'bg-cream-300 text-ink',
};

const ICON: Record<WordStatus, Parameters<typeof Icon>[0]['name']> = {
  VALID: 'check',
  INVALID: 'close',
  NOT_FOUND: 'search',
  PENDING_REVIEW: 'timer',
  SERVICE_UNAVAILABLE: 'wifiOff',
};

/**
 * "Menyemak Kamus Online" while a move is being checked, then one row per
 * word with its verdict. Sits where the word preview is, so the board stays
 * visible and the tiles stay where the player put them.
 */
export function OnlineCheckPanel({
  state,
  suggest,
  onCancel,
  onRetry,
  onClose,
  onSuggest,
}: {
  state: OnlineCheckState;
  suggest: Record<string, 'sending' | SuggestResult>;
  onCancel: () => void;
  onRetry: () => void;
  onClose: () => void;
  onSuggest: (c: WordCheck) => void;
}) {
  if (state.phase === 'checking') {
    return (
      <div className="flex min-h-[64px] items-center gap-3 rounded-2xl border-2 border-navy-700 bg-navy-100 px-3 py-1.5" role="status" aria-live="polite" data-testid="online-checking">
        <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-navy-800 text-white">
          <Icon name="book" size={20} />
          <motion.span
            className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-mango-400"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display font-semibold text-navy-900">Menyemak Kamus Online…</div>
          <div className="flex flex-wrap gap-x-2">
            {state.words.map((w, i) => (
              <motion.span key={w} animate={{ opacity: [0.45, 1, 0.45] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}>
                <JawiText text={w} className="text-xl leading-[1.5] font-bold text-navy-800" />
              </motion.span>
            ))}
          </div>
        </div>
        <Button tone="ghost" onClick={onCancel} data-testid="online-cancel">
          Batal
        </Button>
      </div>
    );
  }

  const { checks } = state;
  const canRetry = checks.some((c) => c.status === 'SERVICE_UNAVAILABLE' || c.status === 'NOT_FOUND' || c.status === 'PENDING_REVIEW');
  return (
    <div className="max-h-[42vh] overflow-y-auto rounded-2xl border-2 border-mango-500 bg-mango-100 px-3 py-2" role="status" aria-live="polite" data-testid="online-result">
      <div className="mb-1 flex items-center gap-2">
        <Icon name="book" className="shrink-0 text-navy-800" />
        <h2 className="flex-1 font-display font-semibold text-navy-900">Semakan Kamus Online</h2>
        <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full hover:bg-mango-200" aria-label="Tutup keputusan kamus" data-testid="online-close">
          <Icon name="close" />
        </button>
      </div>
      <ul className="grid gap-1.5">
        {checks.map((c, i) => {
          const s = suggest[c.key];
          return (
            <motion.li
              key={c.key + i}
              className="rounded-xl bg-white/80 px-2.5 py-1.5"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              data-testid="online-row"
              data-status={c.status}
            >
              <div className="flex flex-wrap items-center gap-x-2">
                <JawiText text={c.word} className="text-2xl leading-[1.5] font-bold text-navy-900" />
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-extrabold whitespace-nowrap ${CHIP[c.status]}`}>
                  <Icon name={ICON[c.status]} size={13} />
                  {STATUS_LABEL[c.status]}
                </span>
              </div>
              <p className="text-sm leading-snug text-ink-soft">{c.message}</p>
              {(c.status === 'NOT_FOUND' || (c.status === 'PENDING_REVIEW' && s)) && (
                <button
                  type="button"
                  disabled={!!s && s !== 'error' && s !== 'too-soon'}
                  onClick={() => onSuggest(c)}
                  className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-mango-400 px-3 font-display text-sm font-semibold text-ink disabled:bg-cream-200 disabled:text-ink-soft"
                  data-testid="suggest-word"
                >
                  <Icon name={s === 'sent' || s === 'already' ? 'check' : 'plus'} size={16} />
                  {s === 'sending' ? 'Menghantar…' : s === 'sent' || s === 'already' ? 'Dicadangkan ✓' : 'Cadangkan Perkataan'}
                </button>
              )}
              {c.source && c.status !== 'VALID' && (
                <p className="text-xs text-ink-soft">
                  Sumber: {c.source.name} ({c.source.version})
                </p>
              )}
            </motion.li>
          );
        })}
      </ul>
      <p className="mt-1 text-xs text-ink-soft">Jubin kekal di papan; giliran anda tidak hilang.</p>
      <div className="mt-1.5 flex gap-2">
        {canRetry && (
          <Button tone="navy" icon="undo" className="flex-1" onClick={onRetry} data-testid="online-retry">
            Cuba lagi
          </Button>
        )}
        <Button tone="cream" className="flex-1" onClick={onClose}>
          Ubah langkah
        </Button>
      </div>
    </div>
  );
}
