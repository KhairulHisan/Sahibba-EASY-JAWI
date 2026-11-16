/**
 * The multiplayer game table. Everything shown comes from the server
 * (public room document + this player's private rack); the local engine is
 * used only for a live preview and hints. Every action goes to the server,
 * which re-validates it and is the only writer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionBar } from '../../components/ActionBar';
import { BlankPicker } from '../../components/BlankPicker';
import { Board } from '../../components/Board';
import { Button } from '../../components/Button';
import { GameHUD, type HudPlayer } from '../../components/GameHUD';
import { Icon } from '../../components/Icon';
import { JawiText } from '../../components/JawiText';
import { MenuItem } from '../../components/MenuItem';
import { ConfirmSheet, Sheet } from '../../components/Sheet';
import { TileRack } from '../../components/TileRack';
import { toast } from '../../components/Toast';
import { WordDetail } from '../../components/WordDetail';
import { WordPreview } from '../../components/WordPreview';
import { coreLexicon } from '../../data';
import { getLayout, idx } from '../../engine/board';
import type { MoveCandidate } from '../../engine/bot';
import { evaluatePlay } from '../../engine/game';
import { randomId } from '../../engine/rng';
import type { Placement } from '../../engine/types';
import { useElementSize } from '../../hooks/useElementSize';
import { WIDE_LAYOUT, useMediaQuery } from '../../hooks/useMediaQuery';
import { fx } from '../../lib/feedback';
import { HINTS_PER_PLAYER, MP_TIMING, isConnected, type GameActionRequest, type HandDoc, type PublicMove, type RoomDoc } from '../../multiplayer/protocol';
import { localGameView, wordsThrough } from '../../multiplayer/view';
import { navigate } from '../../state/router';
import { useSettings } from '../../state/settings';
import { orderedRack } from '../play/rackOrder';
import { SwapSheet } from '../play/SwapSheet';
import { useTileTable } from '../play/useTileTable';
import { computeHint } from '../single/botClient';
import { mpApi } from './api';
import { MpResults } from './MpResults';
import { useMpSession } from './session';
import { playerTone } from './tones';

const NO_DRAFT: Placement[] = [];
const NO_ORDER: string[] = [];

type ActionBody = { kind: 'play'; placements: Placement[] } | { kind: 'swap'; tileIds: string[] } | { kind: 'pass' } | { kind: 'resign' };

/** Reading order of a move's new tiles: horizontal right→left, vertical top→bottom. */
function readingOrder(m: PublicMove, size: number): number[] {
  const ps = [...m.placements];
  const horizontal = ps.every((p) => p.y === ps[0]!.y);
  ps.sort((a, b) => (horizontal ? b.x - a.x : a.y - b.y));
  return ps.map((p) => idx(size, p.x, p.y));
}

export function MultiplayerTable({ roomId, room, hand, uid, now, offset, online }: { roomId: string; room: RoomDoc; hand: HandDoc | null; uid: string; now: number; offset: number; online: boolean }) {
  const game = room.game!;
  const lexicon = useMemo(() => coreLexicon(), []);
  const layout = getLayout(game.rules.layoutId);
  const settings = useSettings();

  const draft = useMpSession((s) => s.drafts[roomId]) ?? NO_DRAFT;
  const rackOrder = useMpSession((s) => s.rackOrders[roomId]) ?? NO_ORDER;
  const hintsUsed = useMpSession((s) => s.hintsUsed[roomId] ?? 0);
  const saveDraft = useMpSession((s) => s.setDraft);
  const saveOrder = useMpSession((s) => s.setRackOrder);
  const markHint = useMpSession((s) => s.useHint);
  const leaveSession = useMpSession((s) => s.leave);
  const setDraft = useCallback((d: Placement[]) => saveDraft(roomId, d), [roomId, saveDraft]);
  const setRackOrder = useCallback((o: string[]) => saveOrder(roomId, o), [roomId, saveOrder]);

  // Tiles just sent in a play stay hidden until the refilled rack arrives, so
  // they never flash back into the rack between the two snapshots.
  const [sent, setSent] = useState<{ ids: Set<string>; version: number } | null>(null);
  const rack = useMemo(() => {
    const r = hand?.rack ?? [];
    if (!sent || (hand && hand.version >= sent.version)) return r;
    return r.filter((t) => !sent.ids.has(t.id));
  }, [hand, sent]);

  const view = useMemo(() => localGameView(room, rack, uid), [room, rack, uid]);
  const myIdx = room.players.findIndex((p) => p.uid === uid);
  const me = room.players[myIdx];
  const finished = room.status !== 'bermain';
  const [busy, setBusy] = useState(false);
  const isYourTurn = !finished && game.currentUid === uid && !!me && !me.resigned;
  const canAct = isYourTurn && online && !busy;
  const nameOf = useCallback((u: string) => (u === uid ? 'Anda' : (room.players.find((p) => p.uid === u)?.nickname ?? 'Pemain')), [room.players, uid]);

  const [wave, setWave] = useState<{ key: number; order: number[] } | null>(null);
  const [hint, setHint] = useState<MoveCandidate | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'resign' | 'pass' | 'leave'>(null);
  const [wordShown, setWordShown] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const boardScroller = useRef<HTMLDivElement | null>(null);
  const [rackBox, rackSize] = useElementSize<HTMLDivElement>();
  const wide = useMediaQuery(WIDE_LAYOUT);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);
  const versionRef = useRef(game.version);
  versionRef.current = game.version;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  const clearHint = useCallback(() => setHint(null), []);
  const table = useTileTable({
    layout,
    board: game.board,
    rack,
    isYourTurn: isYourTurn && !busy,
    interactive: !finished,
    draft,
    setDraft,
    rackOrder,
    setRackOrder,
    scrollContainer: () => boardScroller.current,
    onPlacedTileTap: (k) => {
      const words = wordsThrough(game.board, layout.size, k % layout.size, Math.floor(k / layout.size));
      if (words[0]) setWordShown(words[0]);
    },
    onPlaced: clearHint,
  });
  const { rackById, validDraft, draftMap, rackTiles, selected, setSelected, wobble, hoverCell, hoverRack, drag, onCellActivate, recallOrShuffle } = table;
  useEffect(() => {
    if (validDraft.length !== draft.length) setDraft(validDraft);
  }, [validDraft, draft.length, setDraft]);

  const evaluation = useMemo(
    () => (view && validDraft.length && isYourTurn ? evaluatePlay(view, myIdx, validDraft, lexicon) : null),
    [view, validDraft, isYourTurn, myIdx, lexicon],
  );
  const errorCells = useMemo(() => {
    if (!evaluation || evaluation.ok || evaluation.error.code === 'UNKNOWN_WORD') return undefined;
    return new Set((evaluation.error.cells ?? []).map((c) => idx(layout.size, c.x, c.y)));
  }, [evaluation, layout.size]);
  const lastMoveCells = useMemo(
    () => new Set(game.lastMove?.type === 'play' ? game.lastMove.placements.map((p) => idx(layout.size, p.x, p.y)) : []),
    [game.lastMove, layout.size],
  );
  const hintCells = useMemo(() => {
    if (!hint) return undefined;
    const m = new Map<number, string>();
    for (const p of hint.placements) m.set(idx(layout.size, p.x, p.y), p.letter ?? rackById.get(p.tileId)?.letter ?? '');
    return m;
  }, [hint, layout.size, rackById]);

  // The latest word played, kept across passes/swaps.
  const [lastPlay, setLastPlay] = useState<{ text: string; score: number; who: string } | null>(() =>
    game.lastMove?.type === 'play' && game.lastMove.words[0] ? { text: game.lastMove.words[0].text, score: game.lastMove.score, who: nameOf(game.lastMove.uid) } : null,
  );

  const seats = useMemo(() => [...room.players].sort((a, b) => a.seat - b.seat), [room.players]);
  const hudPlayers: HudPlayer[] = seats.map((p) => ({
    id: p.uid,
    name: p.nickname,
    initial: p.nickname.slice(0, 1) || '?',
    tone: playerTone(room.players, p.uid),
    isYou: p.uid === uid,
    away: !isConnected(p, now),
    out: p.resigned || p.left,
  }));

  // ---- actions --------------------------------------------------------------
  // Synchronous guard: a fast double tap must not send two different actions.
  const inFlight = useRef(false);
  const send = async (body: ActionBody, hideIds?: string[]): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    const version = game.version;
    if (hideIds) setSent({ ids: new Set(hideIds), version: version + 1 });
    try {
      // One id per user action: automatic retries reuse it, so a request that
      // did reach the server is never applied twice.
      await mpApi.action({ ...body, roomId, actionId: randomId(`${body.kind}-v${version}-`), expectedVersion: version } as GameActionRequest);
      return true;
    } catch (e) {
      if (hideIds) setSent(null);
      table.bumpWobble();
      fx('word-invalid');
      toast({ tone: 'coral', content: e instanceof Error ? e.message : 'Langkah tidak dihantar.' }, 3600);
      return false;
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const onSubmit = async () => {
    if (!canAct || !validDraft.length) return;
    if (evaluation && !evaluation.ok) {
      // Same rules + dictionary as the server: show the reason without a round trip.
      table.bumpWobble();
      fx('word-invalid');
      toast({ tone: 'coral', content: evaluation.error.message }, 3200);
      return;
    }
    const placements = validDraft;
    if (await send({ kind: 'play', placements }, placements.map((p) => p.tileId))) {
      setDraft([]);
      setSelected(null);
    }
  };

  const hintLimit = HINTS_PER_PLAYER[room.settings.difficulty];
  const hintsLeft = hintLimit === null ? null : Math.max(0, hintLimit - hintsUsed);
  const onHint = async () => {
    if (hintLoading || !view || hintsLeft === 0) return;
    setHintLoading(true);
    const v = game.version;
    try {
      const h = await computeHint(view, myIdx, room.settings.difficulty, lexicon, 'teras');
      if (!mounted.current || versionRef.current !== v) return;
      fx('hint');
      if (!h) {
        toast({ tone: 'mango', content: 'Tiada langkah ditemui dengan rak ini. Cuba TUKAR jubin atau langkau giliran.' }, 3600);
        return;
      }
      markHint(roomId);
      setDraft([]);
      setHint(h);
    } finally {
      if (mounted.current) setHintLoading(false);
    }
  };

  // ---- reactions to server updates -----------------------------------------
  const seenMoves = useRef(game.moveCount);
  useEffect(() => {
    if (game.moveCount <= seenMoves.current) {
      seenMoves.current = game.moveCount;
      return;
    }
    seenMoves.current = game.moveCount;
    setHint(null);
    const m = game.lastMove;
    if (!m) return;
    const byMe = m.uid === uid;
    const who = nameOf(m.uid);
    if (m.type === 'play' && m.words[0]) {
      const main = m.words[0];
      setLastPlay({ text: main.text, score: m.score, who });
      setWave({ key: game.version, order: readingOrder(m, layout.size) });
      fx(m.words.length > 1 ? 'multi-word-combo' : 'word-valid');
      toast(
        {
          tone: byMe ? 'jade' : 'navy',
          onClick: () => setWordShown(main.text),
          content: (
            <span className="flex items-center gap-2">
              <span>{byMe ? 'Bagus! Perkataan diterima' : `${who} bermain`}</span>
              <JawiText text={main.text} className="text-2xl leading-[1.4] font-bold" />
              <span className="rounded-lg bg-white/20 px-1.5 font-display">+{m.score}</span>
              {m.allTilesBonus && <span className="rounded-lg bg-mango-400 px-1.5 text-ink">7 jubin!</span>}
            </span>
          ),
        },
        3400,
      );
    } else if (m.type === 'swap') {
      fx('tile-swap');
      toast({ tone: 'navy', content: `${who} menukar ${m.swapped ?? ''} jubin.` });
    } else if (m.type === 'pass') {
      toast({ tone: 'navy', content: `${who} melangkau giliran.` });
    } else if (m.type === 'timeout') {
      if (byMe) setDraft([]);
      toast({ tone: byMe ? 'coral' : 'navy', content: byMe ? 'Masa tamat — giliran anda dilangkau.' : `Giliran ${who} dilangkau (masa tamat / terputus).` }, 3200);
    } else if (m.type === 'resign') {
      toast({ tone: 'coral', content: byMe ? 'Anda telah menyerah.' : `${who} menyerah / keluar.` });
    }
    if (room.status === 'bermain' && game.currentUid === uid && !byMe) window.setTimeout(() => fx('turn-start'), 450);
  }, [game.moveCount, game.lastMove, game.version, game.currentUid, room.status, uid, nameOf, layout.size, setDraft]);

  // ---- turn timer (server deadline) + timeout claims -------------------------
  useEffect(() => {
    if (finished || game.turnDeadline === null) {
      setTimeLeft(null);
      return;
    }
    const deadline = game.turnDeadline;
    const mine = game.currentUid === uid;
    let shown = -1;
    let nextClaim = 0;
    // A little jitter so several waiting players don't all claim at once
    // (the server accepts exactly one claim per turn either way).
    const jitter = mine ? 0 : 400 + Math.random() * 1600;
    const tick = () => {
      const serverNow = Date.now() + offsetRef.current;
      const left = Math.max(0, Math.ceil((deadline - serverNow) / 1000));
      if (left !== shown) {
        shown = left;
        setTimeLeft(left);
        if (mine && left > 0 && left <= 10 && left % 5 === 0) fx('countdown-warning');
      }
      if (navigator.onLine && serverNow >= deadline + MP_TIMING.deadlineGraceMs + jitter && serverNow >= nextClaim) {
        nextClaim = serverNow + 4000;
        void mpApi.claimTimeout(roomId, game.version).catch(() => undefined);
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [finished, game.turnDeadline, game.currentUid, game.version, uid, roomId]);

  // No timer: skip a player who has been disconnected for too long.
  const current = room.players.find((p) => p.uid === game.currentUid);
  const currentAway = !!current && current.uid !== uid && !isConnected(current, now);
  useEffect(() => {
    if (finished || game.turnDeadline !== null || !current || current.uid === uid) return;
    const due = current.lastSeen + MP_TIMING.turnDisconnectGraceMs + 1000 + Math.random() * 1500;
    const t = window.setTimeout(() => void mpApi.claimTimeout(roomId, game.version).catch(() => undefined), Math.max(0, due - (Date.now() + offsetRef.current)));
    return () => window.clearTimeout(t);
  }, [finished, game.turnDeadline, game.version, current, uid, roomId]);

  // ---- layout ---------------------------------------------------------------
  const tileSize = Math.max(44, Math.min(62, Math.floor(((rackSize.width || 340) - 16 - 6 * 6) / 7)));
  const timerOn = game.turnDeadline !== null;
  const hud = <GameHUD game={view!} players={hudPlayers} timeLeft={timeLeft} turnSeconds={timerOn ? room.settings.turnSeconds : null} bagCount={game.bagCount} />;
  const waiting = finished
    ? 'Permainan tamat!'
    : me?.resigned
      ? 'Anda telah menyerah — menonton permainan.'
      : !isYourTurn
        ? currentAway
          ? `${current!.nickname} terputus… giliran akan dilangkau automatik.`
          : `Giliran ${current?.nickname ?? 'pemain lain'}…`
        : busy
          ? 'Menghantar langkah ke pelayan…'
          : null;

  return (
    <div className={`app-bg flex h-full overflow-hidden ${wide ? 'flex-row' : 'flex-col'}`} data-testid="mp-table">
      <h1 className="sr-only">Permainan berbilang pemain — bilik {room.code}</h1>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!wide && <div className="safe-top px-2 pt-1.5">{hud}</div>}
        {!online && (
          <div className="mx-2 mt-1.5 flex items-center gap-2 rounded-xl bg-coral-500 px-3 py-1.5 text-sm font-bold text-white" role="status" data-testid="mp-offline">
            <Icon name="wifiOff" size={16} /> Sambungan terputus — menyambung semula… Langkah anda disimpan.
          </div>
        )}
        <div className="relative min-h-0 flex-1 px-1 pt-1.5">
          <Board
            layout={layout}
            cells={game.board}
            draft={draftMap}
            draftState={evaluation?.ok ? 'ok' : 'neutral'}
            errorCells={errorCells}
            hintCells={hintCells}
            lastMoveCells={lastMoveCells}
            wave={wave}
            wobbleKey={wobble}
            hoverCell={hoverCell}
            interactive={!finished}
            onCellActivate={onCellActivate}
            bindDraftTile={(id, size) => drag.bind({ tileId: id, from: 'board' }, size)}
            scrollRef={(el) => (boardScroller.current = el)}
          />
        </div>
      </div>

      <div className={`safe-bottom flex flex-col gap-1.5 px-2 pt-1.5 ${wide ? 'w-[min(440px,46%)] justify-center overflow-y-auto py-3' : ''}`}>
        {wide && hud}
        <div className="flex items-center justify-between px-1 text-xs font-bold text-ink-soft">
          <span data-testid="mp-room-code">Bilik {room.code}</span>
          <span>Tahap {room.settings.difficulty.toUpperCase()}</span>
        </div>
        {hint ? (
          <div className="flex min-h-[64px] items-center gap-2 rounded-2xl border-2 border-jade-500 bg-jade-100 px-3 py-1.5" data-testid="hint-panel">
            <Icon name="bulb" className="shrink-0 text-jade-700" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-jade-700">Cadangan · +{hint.score} mata</div>
              <JawiText text={hint.mainWord} className="text-2xl leading-[1.4] font-bold text-jade-700" />
              {room.settings.difficulty === 'mudah' && (
                <div className="truncate text-xs text-ink-soft">
                  {lexicon.lookup(hint.mainWord)[0]?.rumi} — {lexicon.lookup(hint.mainWord)[0]?.meaningMs}
                </div>
              )}
            </div>
            <Button
              tone="jade"
              onClick={() => {
                setDraft(hint.placements);
                setHint(null);
                fx('tile-drop');
              }}
              data-testid="apply-hint"
            >
              Guna
            </Button>
            <button type="button" onClick={() => setHint(null)} className="grid size-11 place-items-center rounded-full hover:bg-jade-200" aria-label="Tutup cadangan">
              <Icon name="close" />
            </button>
          </div>
        ) : (
          <WordPreview evaluation={evaluation} isYourTurn={isYourTurn} waiting={waiting} lastWord={lastPlay} onShowWord={setWordShown} />
        )}
        <div ref={rackBox}>
          <TileRack
            tiles={rackTiles}
            selectedId={selected}
            bindTile={(id, size) => drag.bind({ tileId: id, from: 'rack' }, size)}
            onKeyActivate={(id) => table.onTap({ tileId: id, from: 'rack' })}
            tileSize={tileSize}
            showNames={settings.showLetterNames}
            disabled={finished || !!me?.resigned}
            hoverRack={hoverRack}
          />
        </div>
        <ActionBar
          actions={[
            {
              id: 'susun',
              label: 'SUSUN SEMULA',
              sub: validDraft.length ? 'tarik balik' : 'kocok rak',
              icon: validDraft.length ? 'undo' : 'shuffle',
              onClick: recallOrShuffle,
              disabled: finished || busy,
            },
            {
              id: 'tukar',
              label: 'TUKAR',
              icon: 'swap',
              onClick: () => {
                setDraft([]);
                setSwapOpen(true);
              },
              disabled: !canAct,
              disabledReason: isYourTurn ? 'Menunggu sambungan' : 'Bukan giliran anda',
            },
            {
              id: 'bantuan',
              label: hintLoading ? 'MENCARI…' : 'BANTUAN',
              icon: 'bulb',
              onClick: () => void onHint(),
              disabled: !isYourTurn || busy || hintsLeft === 0 || hintLoading,
              disabledReason: hintsLeft === 0 ? 'Bantuan sudah habis' : 'Bukan giliran anda',
              badge: hintsLeft === null ? '∞' : String(hintsLeft),
            },
            {
              id: 'sahkan',
              label: busy ? 'MENGHANTAR…' : 'SAHKAN',
              icon: 'check',
              primary: true,
              onClick: () => void onSubmit(),
              disabled: !canAct || validDraft.length === 0,
              disabledReason: !isYourTurn ? 'Bukan giliran anda' : !online ? 'Menunggu sambungan' : 'Letakkan jubin di papan dahulu',
            },
            { id: 'menu', label: 'MENU', icon: 'menu', onClick: () => setMenuOpen(true) },
          ]}
        />
      </div>

      {table.ghost}
      <BlankPicker open={!!table.blankFor} onCancel={() => table.setBlankFor(null)} onPick={table.pickBlankLetter} />

      <SwapSheet
        open={swapOpen}
        onClose={() => setSwapOpen(false)}
        tiles={orderedRack(rack, rackOrder)}
        bagCount={game.bagCount}
        minBagForSwap={game.rules.minBagForSwap}
        onSwap={(ids) => {
          setSwapOpen(false);
          void send({ kind: 'swap', tileIds: ids });
        }}
        onPassInstead={() => {
          setSwapOpen(false);
          setConfirm('pass');
        }}
      />

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={`Menu · Bilik ${room.code}`}>
        <div className="grid gap-2">
          <MenuItem icon="play" label="Sambung bermain" onClick={() => setMenuOpen(false)} />
          <MenuItem
            icon="skip"
            label="Langkau giliran"
            disabled={!canAct}
            onClick={() => {
              setMenuOpen(false);
              setConfirm('pass');
            }}
          />
          <MenuItem
            icon="flag"
            label="Menyerah kalah (terus menonton)"
            tone="coral"
            disabled={finished || !!me?.resigned}
            onClick={() => {
              setMenuOpen(false);
              setConfirm('resign');
            }}
          />
          <MenuItem
            icon="back"
            label="Keluar bilik"
            tone="coral"
            onClick={() => {
              setMenuOpen(false);
              setConfirm('leave');
            }}
          />
          <MenuItem icon={settings.soundOn ? 'sound' : 'mute'} label={settings.soundOn ? 'Bunyi: Hidup' : 'Bunyi: Senyap'} onClick={() => settings.set({ soundOn: !settings.soundOn })} />
          <MenuItem icon="book" label="Kamus Jawi" onClick={() => navigate('kamus')} />
          <MenuItem icon="info" label="Cara bermain" onClick={() => navigate('tutorial')} />
          <MenuItem icon="home" label="Laman utama (boleh sambung semula)" onClick={() => navigate('home')} />
        </div>
        <p className="mt-3 text-xs text-ink-soft">Permainan berjalan di pelayan dan tidak boleh dijeda. Bantuan dikira pada peranti anda sahaja.</p>
      </Sheet>

      <ConfirmSheet
        open={confirm === 'pass'}
        title="Langkau giliran?"
        message="Anda tidak akan mendapat mata untuk giliran ini."
        confirmLabel="Langkau"
        tone="navy"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          setDraft([]);
          void send({ kind: 'pass' });
        }}
      />
      <ConfirmSheet
        open={confirm === 'resign'}
        title="Menyerah kalah?"
        message="Markah anda kekal tetapi anda tidak boleh bermain lagi dalam permainan ini. Pemain lain akan meneruskan."
        confirmLabel="Ya, menyerah"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void send({ kind: 'resign' });
        }}
      />
      <ConfirmSheet
        open={confirm === 'leave'}
        title="Keluar bilik?"
        message={finished ? 'Anda akan kembali ke menu Multiplayer.' : 'Keluar semasa permainan dikira sebagai menyerah. Pemain lain akan meneruskan.'}
        confirmLabel="Keluar"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          const exit = () => {
            leaveSession();
            navigate('multi', { replace: true });
          };
          if (finished) exit();
          else
            void mpApi
              .leaveRoom(roomId)
              .then(exit)
              .catch((e: unknown) => toast({ tone: 'coral', content: e instanceof Error ? e.message : 'Tidak dapat keluar.' }));
        }}
      />
      <WordDetail word={wordShown} lexicon={lexicon} onClose={() => setWordShown(null)} />
      {finished && game.result && <MpResults roomId={roomId} room={room} uid={uid} />}
    </div>
  );
}
