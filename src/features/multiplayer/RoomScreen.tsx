import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { ScreenHeader } from '../../components/ScreenHeader';
import { toast } from '../../components/Toast';
import { MULTIPLAYER_ENABLED } from '../../lib/firebase';
import { navigate } from '../../state/router';
import { mpApi } from './api';
import { Lobby } from './Lobby';
import { MultiplayerTable } from './MultiplayerTable';
import { useMpSession } from './session';
import { useRoom } from './useRoom';

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};
const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

/** Server-adjusted clock that re-renders every few seconds (for presence dots). */
function useServerNow(offset: number, everyMs = 5000) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setT(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return t + offset;
}

export function RoomScreen() {
  const roomId = useMpSession((s) => s.roomId);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!MULTIPLAYER_ENABLED) navigate('multi', { replace: true });
  }, []);
  if (!roomId)
    return (
      <Notice icon="info" title="Tiada bilik aktif" text="Cipta bilik baharu atau sertai bilik rakan dengan kod 4 digit.">
        <Button tone="jade" size="lg" icon="users" onClick={() => navigate('multi', { replace: true })}>
          Ke Multiplayer
        </Button>
      </Notice>
    );
  return <Room key={`${roomId}:${attempt}`} roomId={roomId} retry={() => setAttempt((a) => a + 1)} />;
}

function Room({ roomId, retry }: { roomId: string; retry: () => void }) {
  const { uid, room, hand, error, fromCache, offset } = useRoom(roomId);
  const leaveSession = useMpSession((s) => s.leave);
  const online = useOnline() && !fromCache;
  const now = useServerNow(offset);
  const forget = () => {
    leaveSession();
    navigate('multi', { replace: true });
  };

  if (error === 'bukan-ahli' || error === 'tiada')
    return (
      <Notice
        icon="close"
        title={error === 'tiada' ? 'Bilik tidak wujud lagi' : 'Anda bukan ahli bilik ini'}
        text={error === 'tiada' ? 'Bilik ini sudah tamat tempoh atau dipadam.' : 'Permintaan anda tidak diluluskan, atau anda telah keluar dari bilik ini.'}
      >
        <Button tone="jade" size="lg" icon="users" onClick={forget}>
          Kembali ke Multiplayer
        </Button>
      </Notice>
    );
  if (error === 'sambungan')
    return (
      <Notice icon="wifiOff" title="Tidak dapat menyambung" text="Semak sambungan Internet anda, kemudian cuba lagi. Bilik anda masih disimpan.">
        <Button tone="jade" size="lg" icon="undo" onClick={retry}>
          Cuba lagi
        </Button>
        <Button tone="cream" icon="back" onClick={() => navigate('multi')}>
          Kembali
        </Button>
      </Notice>
    );
  if (!room || !uid)
    return (
      <Notice icon="users" title="Menyambung ke bilik…" text="Sila tunggu sebentar." busy>
        <Button tone="cream" icon="back" onClick={() => navigate('multi')}>
          Kembali
        </Button>
      </Notice>
    );

  if (room.status === 'tamat-tempoh')
    return (
      <Notice icon="timer" title="Bilik tamat tempoh" text="Bilik ini tidak aktif terlalu lama dan telah ditutup secara automatik.">
        <Button tone="jade" size="lg" icon="users" onClick={forget}>
          Bilik baharu
        </Button>
      </Notice>
    );

  if (room.pending.some((p) => p.uid === uid))
    return (
      <Notice icon="users" title={`Menunggu kelulusan hos · ${room.code}`} text="Hos bilik perlu meluluskan anda sebelum anda boleh menyertai." busy>
        <Button
          tone="cream"
          icon="back"
          onClick={() =>
            void mpApi
              .leaveRoom(roomId)
              .then(forget)
              .catch((e: unknown) => toast({ tone: 'coral', content: e instanceof Error ? e.message : 'Ralat.' }))
          }
        >
          Batal permintaan
        </Button>
      </Notice>
    );

  if ((room.status === 'bermain' || room.status === 'tamat') && room.game)
    return <MultiplayerTable roomId={roomId} room={room} hand={hand} uid={uid} now={now} offset={offset} online={online} />;

  return (
    <div className="app-bg min-h-full overflow-y-auto" data-testid="room">
      <ScreenHeader title={`Bilik ${room.code}`} onBack={() => navigate('multi')} />
      {!online && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-xl bg-coral-500 px-3 py-2 text-sm font-bold text-white" role="status">
          <Icon name="wifiOff" size={16} /> Sambungan terputus — menyambung semula…
        </div>
      )}
      <Lobby roomId={roomId} room={room} uid={uid} now={now} />
    </div>
  );
}

function Notice({ icon, title, text, busy, children }: { icon: Parameters<typeof Icon>[0]['name']; title: string; text: string; busy?: boolean; children?: React.ReactNode }) {
  return (
    <div className="app-bg flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center" data-testid="room-notice">
      <span className={`grid size-16 place-items-center rounded-full bg-navy-800 text-white ${busy ? 'animate-pulse' : ''}`}>
        <Icon name={icon} size={30} />
      </span>
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      <p className="max-w-sm text-ink-soft">{text}</p>
      <div className="grid w-full max-w-xs gap-2">{children}</div>
    </div>
  );
}
