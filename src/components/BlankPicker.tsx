import { JAWI_ALPHABET } from '../engine/jawi';
import { Sheet } from './Sheet';

/** Choose the letter a joker tile represents. */
export function BlankPicker({ open, onPick, onCancel }: { open: boolean; onPick: (letter: string) => void; onCancel: () => void }) {
  return (
    <Sheet open={open} onClose={onCancel} title="Pilih huruf untuk joker">
      <p className="mb-3 text-sm text-ink-soft">Joker bernilai 0 mata tetapi boleh menjadi mana-mana huruf Jawi.</p>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-7" role="group" aria-label="Abjad Jawi">
        {JAWI_ALPHABET.map((l) => (
          <button
            key={l.char}
            type="button"
            onClick={() => onPick(l.char)}
            className="tile-face flex min-h-14 flex-col items-center justify-center rounded-xl hover:brightness-105"
            aria-label={`Huruf ${l.name}`}
            data-letter={l.char}
          >
            <span lang="ms-Arab" dir="rtl" className="font-jawi text-2xl leading-none font-bold">
              {l.char}
            </span>
            <span className="mt-1 text-[10px] font-bold text-ink-soft">{l.name}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
