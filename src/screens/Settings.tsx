import { useState } from 'react';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { ConfirmSheet } from '../components/Sheet';
import { SOUND_LABELS, sound, type SoundId } from '../lib/audio';
import { fx } from '../lib/feedback';
import { useHistory } from '../state/history';
import { useSingle } from '../features/single/store';
import { useDictCache } from '../features/dictionary/cacheStore';
import { ONLINE_DICTIONARY_AVAILABLE } from '../features/dictionary/service';
import { sanitizeNickname, useSettings, type MotionPref } from '../state/settings';

export function SettingsScreen() {
  const s = useSettings();
  const clearHistory = useHistory((h) => h.clear);
  const abandon = useSingle((g) => g.abandon);
  const [confirm, setConfirm] = useState(false);
  const [preview, setPreview] = useState<SoundId>('word-valid');
  const cached = useDictCache((c) => Object.keys(c.entries).length);
  const clearDictCache = useDictCache((c) => c.clear);

  return (
    <div className="app-bg min-h-full overflow-y-auto" data-testid="settings">
      <ScreenHeader title="Tetapan" />
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-10">
        <section className="card grid gap-4 p-4" aria-labelledby="snd">
          <h2 id="snd" className="font-display text-lg font-semibold">
            Bunyi & getaran
          </h2>
          <Toggle label="Bunyi" checked={s.soundOn} onChange={(v) => s.set({ soundOn: v })} testId="toggle-sound" />
          <label className="grid gap-1">
            <span className="flex justify-between font-semibold">
              Kelantangan <span className="text-ink-soft">{Math.round(s.volume * 100)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.volume}
              disabled={!s.soundOn}
              onChange={(e) => s.set({ volume: Number(e.target.value) })}
              className="h-11 w-full accent-navy-800"
              aria-label="Kelantangan bunyi"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select value={preview} onChange={(e) => setPreview(e.target.value as SoundId)} className="min-h-11 flex-1 rounded-xl border-2 border-cream-300 bg-white px-3" aria-label="Pilih bunyi untuk diuji">
              {(Object.keys(SOUND_LABELS) as SoundId[]).map((id) => (
                <option key={id} value={id}>
                  {SOUND_LABELS[id]}
                </option>
              ))}
            </select>
            <Button
              tone="cream"
              icon="sound"
              disabled={!s.soundOn}
              silent
              onClick={() => {
                sound.unlock();
                fx(preview);
              }}
            >
              Uji
            </Button>
          </div>
          <Toggle label="Getaran (peranti disokong)" checked={s.hapticsOn} onChange={(v) => s.set({ hapticsOn: v })} />
        </section>

        <section className="card grid gap-3 p-4" aria-labelledby="mot">
          <h2 id="mot" className="font-display text-lg font-semibold">
            Gerakan & paparan
          </h2>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Animasi">
            {(
              [
                ['system', 'Ikut sistem'],
                ['reduce', 'Kurangkan'],
                ['full', 'Penuh'],
              ] as [MotionPref, string][]
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={s.motion === v}
                onClick={() => s.set({ motion: v })}
                className={`min-h-11 rounded-xl border-2 px-2 text-sm font-bold ${s.motion === v ? 'border-navy-800 bg-navy-800 text-white' : 'border-cream-300 bg-cream-50'}`}
              >
                {l}
              </button>
            ))}
          </div>
          <Toggle label="Tunjuk nama huruf pada jubin rak" checked={s.showLetterNames} onChange={(v) => s.set({ showLetterNames: v })} />
        </section>

        <section className="card grid gap-3 p-4" aria-labelledby="kamus-online" data-testid="smart-dictionary-settings">
          <h2 id="kamus-online" className="font-display text-lg font-semibold">
            Kamus Online Pintar <span className="text-sm font-bold text-ink-soft">(Single Player)</span>
          </h2>
          <Toggle
            label="Semak perkataan baharu dalam talian"
            checked={s.smartDictionary && ONLINE_DICTIONARY_AVAILABLE}
            disabled={!ONLINE_DICTIONARY_AVAILABLE}
            onChange={(v) => s.set({ smartDictionary: v })}
            testId="toggle-smart-dictionary"
          />
          <p className="text-sm text-ink-soft">
            {ONLINE_DICTIONARY_AVAILABLE
              ? 'Jika perkataan tiada dalam kamus permainan, ia disemak dalam kamus pusat yang disahkan pentadbir (dan penyedia kamus berlesen jika disambungkan). Hanya perkataan yang disahkan diberi markah. Perkataan yang belum ditemui boleh dicadangkan untuk disemak. Perlukan Internet; tidak digunakan dalam Multiplayer.'
              : 'Tidak tersedia dalam binaan ini (tiada sambungan pelayan).'}
          </p>
          {ONLINE_DICTIONARY_AVAILABLE && (
            <p className="text-xs text-ink-soft">
              Data dihantar: perkataan yang disemak dan ID pemain tanpa nama sahaja. Keputusan yang disahkan disimpan pada peranti ini selama 3 hari ({cached} perkataan).
            </p>
          )}
        </section>

        <section className="card grid gap-3 p-4" aria-labelledby="par">
          <h2 id="par" className="font-display text-lg font-semibold">
            Ibu bapa & guru
          </h2>
          <Toggle label="Benarkan pemasa giliran" checked={s.timersAllowed} onChange={(v) => s.set({ timersAllowed: v })} />
          <label className="grid gap-1">
            <span className="font-semibold">Nama panggilan lalai</span>
            <input
              value={s.playerName}
              maxLength={16}
              onChange={(e) => s.set({ playerName: e.target.value })}
              onBlur={(e) => s.set({ playerName: sanitizeNickname(e.target.value) })}
              className="min-h-11 rounded-xl border-2 border-cream-300 bg-white px-3"
            />
          </label>
          <p className="text-xs text-ink-soft">
            Privasi: tiada akaun, tiada sembang, tiada iklan. Tetapan, permainan dan sejarah disimpan dalam pelayar peranti ini sahaja.
          </p>
          <Button tone="coral" icon="trash" onClick={() => setConfirm(true)}>
            Padam semua data permainan
          </Button>
        </section>
      </main>
      <ConfirmSheet
        open={confirm}
        title="Padam semua data?"
        message="Permainan semasa, sejarah perlawanan dan tetapan akan dipadam daripada peranti ini."
        confirmLabel="Padam"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          clearHistory();
          clearDictCache();
          abandon();
          s.reset();
          setConfirm(false);
        }}
      />
    </div>
  );
}

function Toggle({ label, checked, onChange, testId, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; testId?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 items-center justify-between gap-3 text-left font-semibold disabled:opacity-50"
      data-testid={testId}
    >
      {label}
      <span className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? 'bg-jade-500' : 'bg-cream-300'}`} aria-hidden="true">
        <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-7' : 'translate-x-1'}`} />
      </span>
    </button>
  );
}
