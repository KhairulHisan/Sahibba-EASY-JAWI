import { motion } from 'motion/react';
import type { GameState } from '../engine/types';
import { Avatar } from './Avatar';
import { CountUp } from './CountUp';
import { Icon } from './Icon';

const TONE_DOT = { navy: 'bg-navy-700', jade: 'bg-jade-500', mango: 'bg-mango-400', coral: 'bg-coral-500' } as const;

export interface HudPlayer {
  id: string;
  name: string;
  initial: string;
  tone: 'navy' | 'jade' | 'mango' | 'coral';
  isYou: boolean;
  /** Multiplayer: no heartbeat recently. */
  away?: boolean;
  /** Multiplayer: resigned or left the room. */
  out?: boolean;
}

export function GameHUD({
  game,
  players,
  timeLeft,
  turnSeconds,
  bagCount = game.bag.length,
}: {
  game: GameState;
  players: HudPlayer[];
  timeLeft: number | null;
  turnSeconds: number | null;
  /** Multiplayer clients never see the bag, only its size. */
  bagCount?: number;
}) {
  const current = game.players[game.currentPlayer]?.id;
  const low = timeLeft !== null && timeLeft <= 10;
  const compact = players.length > 2;
  return (
    <div className="flex items-center gap-1.5" data-testid="hud">
      <div className="flex min-w-0 flex-1 gap-1.5">
        {players.map((p) => {
          const st = game.players.find((x) => x.id === p.id)!;
          const active = current === p.id && game.phase === 'active';
          return (
            <motion.div
              key={p.id}
              className={`relative flex min-w-0 flex-1 items-center rounded-2xl border-2 py-1 ${compact ? 'gap-1 px-1.5' : 'gap-1.5 px-2'} ${active ? 'border-mango-500 bg-mango-100' : 'border-cream-300 bg-cream-50'} ${p.out ? 'opacity-50' : ''}`}
              animate={{ scale: active ? 1 : 0.97 }}
              transition={{ duration: 0.26 }}
              aria-label={`${p.name}: ${st.score} mata${active ? ', sedang bermain' : ''}${p.out ? ', sudah keluar' : p.away ? ', terputus' : ''}`}
              data-testid={p.isYou ? 'hud-you' : 'hud-opponent'}
            >
              {!compact && <Avatar initial={p.initial} tone={p.tone} size={30} />}
              <div className="min-w-0 flex-1 leading-tight">
                <div className="flex items-center gap-0.5 truncate text-xs font-bold text-ink-soft">
                  {compact && <span className={`inline-block size-2 shrink-0 rounded-full ${TONE_DOT[p.tone]}`} aria-hidden="true" />}
                  <span className="truncate">{p.isYou ? 'Anda' : p.name}</span>
                  {p.away && !p.out && <Icon name="wifiOff" size={12} className="shrink-0 text-coral-600" />}
                </div>
                <div className={`font-display font-bold text-navy-900 ${compact ? 'text-lg' : 'text-xl'}`}>
                  <CountUp value={st.score} />
                </div>
              </div>
              {active && <span className="absolute -top-1.5 right-2 rounded-full bg-mango-500 px-1.5 text-[10px] font-extrabold text-ink">GILIRAN</span>}
              {p.out && <span className="absolute -top-1.5 right-2 rounded-full bg-cream-300 px-1.5 text-[10px] font-extrabold text-ink">KELUAR</span>}
            </motion.div>
          );
        })}
      </div>
      <div className="flex shrink-0 flex-col items-center gap-0.5">
        <div className="flex items-center gap-1 rounded-full bg-navy-800 px-2.5 py-1 text-sm font-bold text-white" aria-label={`${bagCount} jubin dalam beg`} data-testid="bag-count">
          <Icon name="bag" size={15} />
          {bagCount}
        </div>
        {turnSeconds !== null && timeLeft !== null && (
          <div
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-bold ${low ? 'bg-coral-500 text-white' : 'bg-cream-200 text-ink'}`}
            role="timer"
            aria-label={`Masa giliran: ${timeLeft} saat`}
          >
            <Icon name="timer" size={14} />
            {timeLeft}s
          </div>
        )}
      </div>
    </div>
  );
}
