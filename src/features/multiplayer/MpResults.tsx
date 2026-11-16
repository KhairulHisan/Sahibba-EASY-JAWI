import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Confetti } from '../../components/Confetti';
import { fx } from '../../lib/feedback';
import { firebase } from '../../lib/firebase';
import type { MoveRecord } from '../../engine/types';
import type { RoomDoc } from '../../multiplayer/protocol';
import { useHistory, type MatchRecord } from '../../state/history';
import { navigate } from '../../state/router';
import { playerTone } from './tones';
import { useMpSession } from './session';

const REASON: Record<string, string> = {
  'rack-out': 'Beg kosong dan seorang pemain menghabiskan jubin.',
  scoreless: 'Beberapa pusingan berturut-turut tanpa mata.',
  resign: 'Pemain lain menyerah atau keluar.',
};

/** Save this match to the device's history (once), with stats from the move log. */
async function record(roomId: string, room: RoomDoc, uid: string) {
  const r = room.game!.result!;
  let wordsPlayed = 0;
  let bestWord: MatchRecord['bestWord'];
  try {
    const { db, fs } = await firebase();
    const snap = await fs.getDocs(fs.collection(db, 'rooms', roomId, 'moves'));
    for (const d of snap.docs) {
      const m = d.data() as MoveRecord;
      if (m.playerId !== uid || m.type !== 'play') continue;
      wordsPlayed++;
      for (const w of m.words) if (!bestWord || w.score > bestWord.score) bestWord = { text: w.text, score: w.score };
    }
  } catch {
    /* stats are optional; the result itself is still recorded */
  }
  useHistory.getState().add({
    id: `mp-${roomId}`,
    finishedAt: room.updatedAt,
    difficulty: room.settings.difficulty,
    reason: r.reason,
    outcome: r.winners.includes(uid) ? (r.isTie ? 'seri' : 'menang') : 'kalah',
    players: r.finalScores.map((s) => ({ name: room.players.find((p) => p.uid === s.uid)?.nickname ?? 'Pemain', score: s.score, isHuman: s.uid === uid })),
    bestWord,
    wordsPlayed,
    turns: room.game!.turn,
  });
}

export function MpResults({ roomId, room, uid }: { roomId: string; room: RoomDoc; uid: string }) {
  const leaveSession = useMpSession((s) => s.leave);
  const result = room.game!.result!;
  const won = result.winners.includes(uid);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    fx(won ? 'game-win' : 'game-lose');
    void record(roomId, room, uid);
  }, [roomId, room, uid, won]);

  const ranking = [...result.finalScores].sort((a, b) => Number(result.winners.includes(b.uid)) - Number(result.winners.includes(a.uid)) || b.score - a.score);
  const title = won ? (result.isTie ? 'Seri!' : 'Tahniah, anda menang!') : 'Permainan tamat';

  return (
    <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-navy-900/60 p-4" role="dialog" aria-modal="true" aria-labelledby="mp-results-title" data-testid="mp-results">
      {won && <Confetti burstKey={1} />}
      <motion.div className="card w-full max-w-md p-5" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
        <h2 id="mp-results-title" className="text-center font-display text-3xl font-bold text-navy-900">
          {title}
        </h2>
        <p className="mt-1 text-center text-sm text-ink-soft">Sebab tamat: {REASON[result.reason]}</p>
        <ol className="mt-4 grid gap-2">
          {ranking.map((s, i) => {
            const p = room.players.find((x) => x.uid === s.uid);
            const winner = result.winners.includes(s.uid);
            return (
              <motion.li
                key={s.uid}
                className={`flex items-center gap-3 rounded-2xl border-2 px-3 py-2 ${winner ? 'border-mango-500 bg-mango-100' : 'border-cream-300 bg-cream-50'}`}
                initial={{ x: -16, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.15 + i * 0.08 }}
                data-testid="mp-result-row"
              >
                <span className="w-5 text-center font-display text-lg font-bold">{i + 1}</span>
                <Avatar initial={(p?.nickname ?? '?').slice(0, 1)} tone={playerTone(room.players, s.uid)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">
                    {p?.nickname ?? 'Pemain'} {s.uid === uid && <span className="text-ink-soft">(Anda)</span>}
                  </span>
                  <span className="text-xs text-ink-soft">
                    {winner && '🏆 Pemenang · '}
                    {s.resigned ? 'Menyerah / keluar' : s.penalty > 0 ? `−${s.penalty} baki jubin` : 'Selesai'}
                  </span>
                </span>
                <span className="font-display text-2xl font-bold text-navy-900">{s.score}</span>
              </motion.li>
            );
          })}
        </ol>
        <div className="mt-5 grid gap-2">
          <Button
            tone="jade"
            size="lg"
            icon="users"
            onClick={() => {
              leaveSession();
              navigate('multi', { replace: true });
            }}
            data-testid="mp-results-exit"
          >
            Bilik baharu
          </Button>
          <Button
            tone="cream"
            icon="home"
            onClick={() => {
              leaveSession();
              navigate('home', { replace: true });
            }}
          >
            Laman utama
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
