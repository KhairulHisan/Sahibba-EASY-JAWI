import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { ConfirmSheet, Sheet } from '../../components/Sheet';
import { toast } from '../../components/Toast';
import { fx } from '../../lib/feedback';
import { ROOM_STATUS_LABEL, isConnected, type RoomDoc, type RoomSettings } from '../../multiplayer/protocol';
import { navigate } from '../../state/router';
import { mpApi } from './api';
import { playerTone } from './tones';
import { useMpSession } from './session';
import { SettingsFields, hintsLabel, timerLabel } from './SettingsFields';

const LEVEL = { mudah: 'MUDAH', sederhana: 'SEDERHANA', sukar: 'SUKAR' } as const;

export function Lobby({ roomId, room, uid, now }: { roomId: string; room: RoomDoc; uid: string; now: number }) {
  const leaveSession = useMpSession((s) => s.leave);
  const me = room.players.find((p) => p.uid === uid);
  const isHost = room.hostUid === uid;
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<RoomSettings>(room.settings);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const prevCount = useRef(room.players.length);
  const prevReady = useRef(room.players.filter((p) => p.ready).length);

  useEffect(() => {
    if (room.players.length > prevCount.current) fx('room-join');
    const ready = room.players.filter((p) => p.ready).length;
    if (ready > prevReady.current) fx('ready-up');
    prevCount.current = room.players.length;
    prevReady.current = ready;
  }, [room.players]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      fx('error');
      toast({ tone: 'coral', content: e instanceof Error ? e.message : 'Ralat.' }, 3500);
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      toast({ tone: 'jade', content: `Kod ${room.code} disalin.` });
    } catch {
      toast({ tone: 'navy', content: `Kod bilik: ${room.code}` });
    }
  };

  const canStart = room.status === 'sedia';
  const slots = Array.from({ length: room.settings.maxPlayers }, (_, i) => room.players[i] ?? null);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-10" data-testid="lobby">
      <section className="card flex items-center gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-ink-soft">Kod bilik</div>
          <div className="font-display text-5xl leading-none font-bold tracking-[0.25em] text-navy-900" data-testid="lobby-code">
            {room.code}
          </div>
          <span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-extrabold ${canStart ? 'bg-jade-500 text-white' : 'bg-mango-200 text-mango-600'}`} data-testid="lobby-status">
            {ROOM_STATUS_LABEL[room.status]}
          </span>
        </div>
        <Button tone="cream" icon="upload" onClick={() => void copyCode()} aria-label={`Salin kod ${room.code}`}>
          Salin
        </Button>
      </section>

      <section className="card grid gap-1 p-4 text-sm" aria-label="Tetapan bilik" data-testid="lobby-settings">
        <h2 className="mb-1 font-display text-lg font-semibold">Tetapan bilik</h2>
        <div>
          Tahap: <b>{LEVEL[room.settings.difficulty]}</b> · Bantuan: <b>{hintsLabel(room.settings.difficulty)}</b>
        </div>
        <div>
          Pemasa: <b>{timerLabel(room.settings.turnSeconds)}</b> · Pemain: <b>2–{room.settings.maxPlayers}</b>
        </div>
        <div>Kelulusan hos: {room.settings.requireApproval ? 'Ya' : 'Tidak'}</div>
        <p className="mt-1 text-xs text-ink-soft">Semak tetapan sebelum menekan SEDIA. Tetapan dikunci apabila permainan bermula.</p>
        {isHost && (
          <Button
            tone="cream"
            icon="gear"
            className="mt-2 justify-self-start"
            onClick={() => {
              setDraftSettings(room.settings);
              setEditOpen(true);
            }}
            disabled={busy}
          >
            Tukar tetapan
          </Button>
        )}
      </section>

      <section className="grid gap-2" aria-label="Pemain">
        <h2 className="font-display text-lg font-semibold">
          Pemain ({room.players.length}/{room.settings.maxPlayers})
        </h2>
        {slots.map((p, i) =>
          p ? (
            <div key={p.uid} className={`flex min-h-16 items-center gap-3 rounded-2xl border-2 px-3 py-2 ${p.uid === uid ? 'border-navy-700 bg-white' : 'border-cream-300 bg-cream-50'}`} data-testid="lobby-player">
              <Avatar initial={p.nickname.slice(0, 1)} tone={playerTone(room.players, p.uid)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">
                  {p.nickname} {p.uid === uid && <span className="font-semibold text-ink-soft">(Anda)</span>}
                </span>
                <span className="flex items-center gap-2 text-xs text-ink-soft">
                  {room.hostUid === p.uid && <span className="rounded-full bg-navy-800 px-1.5 font-extrabold text-white">HOS</span>}
                  <span className={`inline-block size-2 rounded-full ${isConnected(p, now) ? 'bg-jade-500' : 'bg-cream-300'}`} aria-hidden="true" />
                  {isConnected(p, now) ? 'Dalam talian' : 'Terputus'}
                </span>
              </span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${p.ready ? 'bg-jade-500 text-white' : 'bg-cream-200 text-ink-soft'}`}>{p.ready ? '✓ SEDIA' : 'BELUM'}</span>
            </div>
          ) : (
            <div key={`empty-${i}`} className="flex min-h-16 items-center gap-3 rounded-2xl border-2 border-dashed border-cream-300 px-3 text-ink-soft">
              <span className="grid size-9 place-items-center rounded-full bg-cream-200">
                <Icon name="user" size={18} />
              </span>
              Menunggu pemain…
            </div>
          ),
        )}
      </section>

      {isHost && room.pending.length > 0 && (
        <section className="card grid gap-2 p-4" aria-label="Permintaan menyertai">
          <h2 className="font-display text-lg font-semibold">Menunggu kelulusan anda</h2>
          {room.pending.map((p) => (
            <div key={p.uid} className="flex items-center gap-2">
              <span className="flex-1 font-bold">{p.nickname}</span>
              <Button tone="jade" disabled={busy} onClick={() => void run(() => mpApi.approveJoin(roomId, p.uid, true))} data-testid="approve-join">
                Lulus
              </Button>
              <Button tone="cream" disabled={busy} onClick={() => void run(() => mpApi.approveJoin(roomId, p.uid, false))}>
                Tolak
              </Button>
            </div>
          ))}
        </section>
      )}

      <div className="grid gap-2">
        {me && (
          <Button tone={me.ready ? 'cream' : 'jade'} size="lg" icon="check" disabled={busy} onClick={() => void run(() => mpApi.setReady(roomId, !me.ready))} data-testid="lobby-ready">
            {me.ready ? 'BATAL SEDIA' : 'SEDIA'}
          </Button>
        )}
        {isHost && (
          <>
            <Button tone="navy" size="lg" icon="play" disabled={!canStart || busy} onClick={() => void run(() => mpApi.startGame(roomId))} data-testid="lobby-start">
              MULA PERMAINAN
            </Button>
            {!canStart && <p className="text-center text-sm text-ink-soft">Perlukan 2–{room.settings.maxPlayers} pemain dan semua pemain SEDIA.</p>}
          </>
        )}
        {!isHost && <p className="text-center text-sm text-ink-soft">Menunggu hos memulakan permainan…</p>}
        <Button tone="ghost" icon="back" onClick={() => setConfirmLeave(true)} disabled={busy}>
          Keluar bilik
        </Button>
      </div>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Tetapan bilik">
        <SettingsFields value={draftSettings} onChange={setDraftSettings} />
        <p className="mt-3 text-sm text-ink-soft">Menukar tetapan akan membatalkan status SEDIA semua pemain supaya mereka dapat menyemaknya semula.</p>
        <Button
          tone="jade"
          className="mt-3 w-full"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await mpApi.updateSettings(roomId, draftSettings);
              setEditOpen(false);
            })
          }
        >
          Simpan
        </Button>
      </Sheet>
      <ConfirmSheet
        open={confirmLeave}
        title="Keluar bilik?"
        message={isHost ? 'Peranan hos akan diserahkan kepada pemain lain.' : 'Tempat anda akan dikosongkan.'}
        confirmLabel="Keluar"
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() =>
          void run(async () => {
            setConfirmLeave(false);
            await mpApi.leaveRoom(roomId);
            leaveSession();
            navigate('multi', { replace: true });
          })
        }
      />
    </main>
  );
}
