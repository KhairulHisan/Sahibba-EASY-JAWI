import type { Difficulty } from '../../engine/types';
import { HINTS_PER_PLAYER, TURN_SECONDS_OPTIONS, type RoomSettings } from '../../multiplayer/protocol';

const LEVELS: { id: Difficulty; label: string }[] = [
  { id: 'mudah', label: 'MUDAH' },
  { id: 'sederhana', label: 'SEDERHANA' },
  { id: 'sukar', label: 'SUKAR' },
];

export const hintsLabel = (d: Difficulty) => (HINTS_PER_PLAYER[d] === null ? 'tanpa had' : `${HINTS_PER_PLAYER[d]} setiap pemain`);
export const timerLabel = (t: number | null) => (t === null ? 'Tiada pemasa' : `${t} saat`);

function Choice<T extends string | number | null>({ value, options, label, onChange, render }: { value: T; options: readonly T[]; label: string; onChange: (v: T) => void; render: (v: T) => string }) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1 font-display font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={`min-h-11 rounded-full border-2 px-4 text-sm font-bold ${value === o ? 'border-navy-800 bg-navy-800 text-white' : 'border-cream-300 bg-cream-50'}`}
          >
            {render(o)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Room rules chosen by the host. Difficulty is a room-wide preset, identical for every player. */
export function SettingsFields({ value, onChange }: { value: RoomSettings; onChange: (s: RoomSettings) => void }) {
  return (
    <div className="grid gap-4">
      <Choice label="Tahap bilik" value={value.difficulty} options={LEVELS.map((l) => l.id)} onChange={(difficulty) => onChange({ ...value, difficulty })} render={(d) => LEVELS.find((l) => l.id === d)!.label} />
      <p className="-mt-2 text-sm text-ink-soft">Bantuan: {hintsLabel(value.difficulty)}. Peraturan dan kamus sama untuk semua pemain.</p>
      <Choice label="Pemasa giliran" value={value.turnSeconds} options={TURN_SECONDS_OPTIONS} onChange={(turnSeconds) => onChange({ ...value, turnSeconds })} render={timerLabel} />
      <Choice label="Pemain maksimum" value={value.maxPlayers} options={[2, 3, 4] as const} onChange={(maxPlayers) => onChange({ ...value, maxPlayers })} render={(n) => `${n} pemain`} />
      <button
        type="button"
        role="switch"
        aria-checked={value.requireApproval}
        onClick={() => onChange({ ...value, requireApproval: !value.requireApproval })}
        className="flex min-h-11 items-center justify-between gap-3 text-left font-semibold"
      >
        <span>
          Hos meluluskan setiap pemain
          <span className="block text-xs font-normal text-ink-soft">Disyorkan untuk kelas: kod sahaja tidak cukup untuk masuk.</span>
        </span>
        <span className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${value.requireApproval ? 'bg-jade-500' : 'bg-cream-300'}`} aria-hidden="true">
          <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-transform ${value.requireApproval ? 'translate-x-7' : 'translate-x-1'}`} />
        </span>
      </button>
    </div>
  );
}
