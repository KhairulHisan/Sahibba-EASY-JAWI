import { useEffect, useState } from 'react';
import { firebase } from '../../lib/firebase';
import { MP_TIMING, type HandDoc, type RoomDoc } from '../../multiplayer/protocol';
import { mpApi } from './api';

export type RoomError = 'bukan-ahli' | 'tiada' | 'sambungan';

/**
 * Live room + own rack via Firestore listeners, plus a heartbeat that keeps
 * this player "connected" and measures the server clock offset (for timers).
 */
export function useRoom(roomId: string | null) {
  const [uid, setUid] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [hand, setHand] = useState<HandDoc | null>(null);
  const [error, setError] = useState<RoomError | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    const unsubs: (() => void)[] = [];
    setRoom(null);
    setHand(null);
    setError(null);
    firebase()
      .then(({ db, fs, uid: me }) => {
        if (cancelled) return;
        setUid(me);
        unsubs.push(
          fs.onSnapshot(
            fs.doc(db, 'rooms', roomId),
            { includeMetadataChanges: true },
            (snap) => {
              setFromCache(snap.metadata.fromCache);
              if (!snap.exists()) {
                if (!snap.metadata.fromCache) setError('tiada');
                return;
              }
              setError(null);
              setRoom(snap.data() as RoomDoc);
            },
            (err) => setError(err.code === 'permission-denied' ? 'bukan-ahli' : 'sambungan'),
          ),
        );
        unsubs.push(
          fs.onSnapshot(
            fs.doc(db, 'rooms', roomId, 'hands', me),
            (snap) => setHand(snap.exists() ? (snap.data() as HandDoc) : null),
            () => undefined,
          ),
        );
      })
      .catch(() => !cancelled && setError('sambungan'));
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    const beat = async () => {
      if (document.hidden) return;
      const t0 = Date.now();
      try {
        const r = await mpApi.heartbeat(roomId);
        setOffset(r.serverNow - (t0 + Date.now()) / 2);
      } catch {
        /* membership problems surface through the room listener */
      }
    };
    void beat();
    const id = window.setInterval(beat, MP_TIMING.heartbeatMs);
    const onVis = () => !document.hidden && void beat();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [roomId]);

  return { uid, room, hand, error, fromCache, offset };
}
