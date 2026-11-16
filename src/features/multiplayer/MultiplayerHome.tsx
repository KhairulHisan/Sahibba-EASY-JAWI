import { useState } from 'react';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { ScreenHeader } from '../../components/ScreenHeader';
import { fx } from '../../lib/feedback';
import { sanitizeNickname } from '../../lib/nickname';
import { ROOM_CODE_RE, type RoomSettings } from '../../multiplayer/protocol';
import { navigate } from '../../state/router';
import { useSettings } from '../../state/settings';
import { mpApi } from './api';
import { useMpSession } from './session';
import { SettingsFields } from './SettingsFields';

const DEFAULT_SETTINGS: RoomSettings = { difficulty: 'mudah', turnSeconds: null, maxPlayers: 4, requireApproval: false };

function randomCode(): string {
  const buf = new Uint16Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0]! % 10000).padStart(4, '0');
}

/** Four separate digits are easier for children than one text field; the value stays a string. */
function CodeInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
      inputMode="numeric"
      autoComplete="off"
      pattern="[0-9]{4}"
      maxLength={4}
      placeholder="0000"
      aria-describedby={`${id}-help`}
      className="min-h-16 w-full rounded-2xl border-[3px] border-cream-300 bg-white text-center font-display text-4xl font-bold tracking-[0.5em] text-navy-900 focus:border-navy-700"
      data-testid={`${id}-input`}
    />
  );
}

export function MultiplayerHome() {
  const playerName = useSettings((s) => s.playerName);
  const setSettings = useSettings((s) => s.set);
  const session = useMpSession();
  const [tab, setTab] = useState<'cipta' | 'sertai'>('cipta');
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState(playerName);
  const [settings, setRoomSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeOk = ROOM_CODE_RE.test(code);

  const submit = async () => {
    if (!codeOk || busy) return;
    setBusy(true);
    setError(null);
    const name = sanitizeNickname(nickname);
    try {
      const res = tab === 'cipta' ? await mpApi.createRoom({ code, nickname: name, settings }) : await mpApi.joinRoom({ code, nickname: name });
      setSettings({ playerName: name });
      // Moving to another room frees the seat in the previous one.
      const previous = session.roomId;
      if (previous && previous !== res.roomId) void mpApi.leaveRoom(previous).catch(() => undefined);
      session.enter(res.roomId, code, name);
      fx('room-join');
      navigate('bilik');
    } catch (e) {
      fx('error');
      setError(e instanceof Error ? e.message : 'Ralat tidak dijangka.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-bg min-h-full overflow-y-auto" data-testid="multiplayer">
      <ScreenHeader title="Multiplayer" />
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-10">
        {session.roomId && (
          <button type="button" onClick={() => navigate('bilik')} className="card flex min-h-16 items-center gap-3 border-jade-500! bg-jade-100! px-4 py-3 text-left" data-testid="mp-resume">
            <span className="grid size-11 place-items-center rounded-full bg-jade-500 text-white">
              <Icon name="play" />
            </span>
            <span>
              <span className="block font-display text-lg font-semibold text-jade-700">Sambung semula bilik {session.code}</span>
              <span className="text-sm text-ink-soft">Kembali ke bilik anda selepas muat semula atau terputus.</span>
            </span>
          </button>
        )}

        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-cream-200 p-1.5" role="tablist" aria-label="Pilih tindakan">
          {(['cipta', 'sertai'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setError(null);
              }}
              className={`min-h-12 rounded-xl font-display text-lg font-semibold ${tab === t ? 'bg-navy-800 text-white shadow' : 'text-navy-800'}`}
              data-testid={`mp-tab-${t}`}
            >
              {t === 'cipta' ? 'CIPTA BILIK' : 'SERTAI BILIK'}
            </button>
          ))}
        </div>

        <form
          className="card grid gap-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-2">
            <label htmlFor="room-code" className="font-display text-lg font-semibold">
              {tab === 'cipta' ? 'Pilih kod bilik 4 digit' : 'Masukkan kod bilik'}
            </label>
            <CodeInput id="room-code" value={code} onChange={setCode} />
            <div className="flex items-center justify-between gap-2">
              <p id="room-code-help" className="text-sm text-ink-soft">
                {tab === 'cipta' ? 'Kongsi kod ini dengan rakan. Sifar di hadapan dikekalkan (cth. 0427).' : 'Minta kod daripada hos bilik.'}
              </p>
              {tab === 'cipta' && (
                <Button tone="cream" onClick={() => setCode(randomCode())} data-testid="mp-random-code">
                  Jana rawak
                </Button>
              )}
            </div>
          </div>
          <label className="grid gap-1">
            <span className="font-display font-semibold">Nama panggilan</span>
            <input
              value={nickname}
              maxLength={16}
              onChange={(e) => setNickname(e.target.value)}
              className="min-h-12 rounded-xl border-2 border-cream-300 bg-white px-4 text-lg font-semibold"
              autoComplete="off"
              data-testid="mp-nickname"
            />
            <span className="text-xs text-ink-soft">Tiada sembang dan tiada maklumat peribadi dikongsi. Huruf, nombor dan ruang sahaja.</span>
          </label>

          {tab === 'cipta' && <SettingsFields value={settings} onChange={setRoomSettings} />}

          {error && (
            <p className="rounded-xl bg-coral-100 px-3 py-2 font-semibold text-coral-700" role="alert" data-testid="mp-error">
              {error}
            </p>
          )}
          <Button type="submit" tone="jade" size="lg" icon={tab === 'cipta' ? 'plus' : 'users'} disabled={!codeOk || busy} data-testid="mp-submit">
            {busy ? 'Sila tunggu…' : tab === 'cipta' ? 'CIPTA BILIK' : 'SERTAI BILIK'}
          </Button>
        </form>

        <p className="text-center text-xs text-ink-soft">
          Kod 4 digit bukan kata laluan: bilik tamat tempoh secara automatik, cubaan meneka dihadkan dan bilik tidak disenaraikan secara awam.
        </p>
      </main>
    </div>
  );
}
