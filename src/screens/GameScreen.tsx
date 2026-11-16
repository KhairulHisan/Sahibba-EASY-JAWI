import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionBar } from '../components/ActionBar';
import { BlankPicker } from '../components/BlankPicker';
import { Board, type DraftCell } from '../components/Board';
import { Button } from '../components/Button';
import { GameHUD, type HudPlayer } from '../components/GameHUD';
import { Icon } from '../components/Icon';
import { JawiText } from '../components/JawiText';
import { ConfirmSheet, Sheet } from '../components/Sheet';
import { TileFace } from '../components/Tile';
import { TileRack } from '../components/TileRack';
import { toast } from '../components/Toast';
import { WordDetail } from '../components/WordDetail';
import { WordPreview } from '../components/WordPreview';
import { bonusAt, getLayout, idx } from '../engine/board';
import type { MoveCandidate } from '../engine/bot';
import { canSwap, evaluatePlay, lastPlayedWord } from '../engine/game';
import type { Placement } from '../engine/types';
import {
  activeLexicon,
  passTurn,
  requestHint,
  resign,
  runBotTurn,
  submitPlay,
  swapTiles,
} from '../features/single/controller';
import { BOT_PERSONA, HINT_LIMIT, HUMAN_ID, orderedRack, useSingle } from '../features/single/store';
import { useTileDrag, type DragSource, type DropTarget } from '../features/single/useTileDrag';
import { useElementSize } from '../hooks/useElementSize';
import { WIDE_LAYOUT, useMediaQuery } from '../hooks/useMediaQuery';
import { fx } from '../lib/feedback';
import { navigate } from '../state/router';
import { useSettings } from '../state/settings';

const THINK_MS = { mudah: 900, sederhana: 1100, sukar: 1300 } as const;

export function GameScreen() {
  const game = useSingle((s) => s.game);
  if (!game) return <NoGame />;
  return <ActiveGame key={game.id} />;
}

function NoGame() {
  return (
    <div className="app-bg flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <Icon name="info" size={40} className="text-navy-700" />
      <h1 className="font-display text-2xl font-semibold">Tiada permainan aktif</h1>
      <p className="text-ink-soft">Mulakan permainan baharu menentang bot.</p>
      <Button tone="jade" size="lg" icon="play" onClick={() => navigate('single')}>
        Main Single Player
      </Button>
      <Button tone="cream" icon="home" onClick={() => navigate('home')}>
        Laman Utama
      </Button>
    </div>
  );
}

function ActiveGame() {
  const game = useSingle((s) => s.game)!;
  const draft = useSingle((s) => s.draft);
  const rackOrder = useSingle((s) => s.rackOrder);
  const notice = useSingle((s) => s.notice);
  const turnSeconds = useSingle((s) => s.turnSeconds);
  const packIds = useSingle((s) => s.packIds);
  const hintsUsed = useSingle((s) => s.hintsUsed);
  const setDraft = useSingle((s) => s.setDraft);
  const setRackOrder = useSingle((s) => s.setRackOrder);
  const settings = useSettings();

  const lexicon = useMemo(() => activeLexicon(), [packIds]);
  const layout = getLayout(game.rules.layoutId);
  const humanIdx = game.players.findIndex((p) => p.id === HUMAN_ID);
  const human = game.players[humanIdx]!;
  const botPlayer = game.players.find((p) => p.kind === 'bot')!;
  const persona = BOT_PERSONA[game.difficulty];
  const isYourTurn = game.phase === 'active' && game.currentPlayer === humanIdx;

  const [selected, setSelected] = useState<string | null>(null);
  const [blankFor, setBlankFor] = useState<{ tileId: string; x: number; y: number } | null>(null);
  const [wobble, setWobble] = useState(0);
  const [wave, setWave] = useState<{ key: number; order: number[] } | null>(null);
  const [hint, setHint] = useState<MoveCandidate | null>(null);
  const [hoverCell, setHoverCell] = useState<number | null>(null);
  const [hoverRack, setHoverRack] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapSel, setSwapSel] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<null | 'resign' | 'pass'>(null);
  const [wordShown, setWordShown] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const boardScroller = useRef<HTMLDivElement | null>(null);
  const [rackBox, rackSize] = useElementSize<HTMLDivElement>();

  const wide = useMediaQuery(WIDE_LAYOUT);
  const timerOn = turnSeconds !== null && settings.timersAllowed;

  // ---- derived -------------------------------------------------------------
  const rackById = useMemo(() => new Map(human.rack.map((t) => [t.id, t])), [human.rack]);
  // Drop draft entries that no longer match the rack/board (e.g. after reload).
  const validDraft = useMemo(
    () => draft.filter((p) => rackById.has(p.tileId) && !game.board[idx(layout.size, p.x, p.y)]),
    [draft, rackById, game.board, layout.size],
  );
  useEffect(() => {
    if (validDraft.length !== draft.length) setDraft(validDraft);
  }, [validDraft, draft.length, setDraft]);

  const draftMap = useMemo(() => {
    const m = new Map<number, DraftCell>();
    for (const p of validDraft) {
      const t = rackById.get(p.tileId)!;
      m.set(idx(layout.size, p.x, p.y), { tileId: t.id, letter: t.isBlank ? (p.letter ?? '') : t.letter, value: t.value, isBlank: t.isBlank });
    }
    return m;
  }, [validDraft, rackById, layout.size]);
  const draftIds = useMemo(() => new Set(validDraft.map((p) => p.tileId)), [validDraft]);
  const rackTiles = useMemo(() => orderedRack(human.rack, rackOrder).filter((t) => !draftIds.has(t.id)), [human.rack, rackOrder, draftIds]);

  const evaluation = useMemo(
    () => (validDraft.length && isYourTurn ? evaluatePlay(game, humanIdx, validDraft, lexicon) : null),
    [validDraft, game, humanIdx, lexicon, isYourTurn],
  );
  const errorCells = useMemo(() => {
    if (!evaluation || evaluation.ok || evaluation.error.code === 'UNKNOWN_WORD') return undefined;
    return new Set((evaluation.error.cells ?? []).map((c) => idx(layout.size, c.x, c.y)));
  }, [evaluation, layout.size]);
  const lastMoveCells = useMemo(() => {
    const last = [...game.moves].reverse().find((m) => m.type === 'play');
    return new Set((last?.placements ?? []).map((p) => idx(layout.size, p.x, p.y)));
  }, [game.moves, layout.size]);
  const hintCells = useMemo(() => {
    if (!hint) return undefined;
    const m = new Map<number, string>();
    for (const p of hint.placements) m.set(idx(layout.size, p.x, p.y), p.letter ?? rackById.get(p.tileId)?.letter ?? '');
    return m;
  }, [hint, layout.size, rackById]);
  const last = lastPlayedWord(game);
  const lastWord = last ? { text: last.text, score: last.score, who: last.playerId === HUMAN_ID ? 'Anda' : persona.name } : null;

  const hudPlayers: HudPlayer[] = [
    { id: HUMAN_ID, name: human.name, initial: human.name.slice(0, 1) || 'A', tone: 'navy', isYou: true },
    { id: botPlayer.id, name: persona.name, initial: persona.initial, tone: persona.tone, isYou: false },
  ];

  // ---- tile movement ------------------------------------------------------
  const placeTile = useCallback(
    (tileId: string, x: number, y: number, letter?: string) => {
      if (!isYourTurn) return;
      const k = idx(layout.size, x, y);
      const occupant = draftMap.get(k);
      if (game.board[k] || (occupant && occupant.tileId !== tileId)) {
        fx('word-invalid');
        setWobble((w) => w + 1);
        return;
      }
      const tile = rackById.get(tileId);
      if (!tile) return;
      if (tile.isBlank && !letter) {
        setBlankFor({ tileId, x, y });
        return;
      }
      const next: Placement[] = [...validDraft.filter((p) => p.tileId !== tileId), { tileId, x, y, ...(tile.isBlank ? { letter } : {}) }];
      setDraft(next);
      setSelected(null);
      setHint(null);
      fx('tile-drop');
      if (bonusAt(layout, x, y)) window.setTimeout(() => fx('bonus-cell'), 90);
    },
    [isYourTurn, layout, draftMap, game.board, rackById, validDraft, setDraft],
  );

  const returnToRack = useCallback(
    (tileId: string, index?: number) => {
      const wasDraft = draftIds.has(tileId);
      if (wasDraft) setDraft(validDraft.filter((p) => p.tileId !== tileId));
      if (index !== undefined) {
        const visible = rackTiles.map((t) => t.id).filter((id) => id !== tileId);
        const from = rackTiles.findIndex((t) => t.id === tileId);
        const at = from >= 0 && from < index ? index - 1 : index;
        visible.splice(Math.max(0, Math.min(visible.length, at)), 0, tileId);
        setRackOrder([...visible, ...[...draftIds].filter((id) => id !== tileId)]);
      }
      fx('tile-snap');
    },
    [draftIds, validDraft, rackTiles, setDraft, setRackOrder],
  );

  const onDrop = useCallback(
    (src: DragSource, target: DropTarget) => {
      if (target.kind === 'cell') {
        if (!isYourTurn) {
          toast({ tone: 'navy', content: 'Tunggu giliran anda dahulu.' });
          return;
        }
        placeTile(src.tileId, target.x, target.y);
      } else if (target.kind === 'rack') returnToRack(src.tileId, target.index);
    },
    [isYourTurn, placeTile, returnToRack],
  );
  const onTap = useCallback(
    (src: DragSource) => {
      if (src.from === 'board') {
        returnToRack(src.tileId);
        return;
      }
      fx('tile-pickup');
      setSelected((s) => (s === src.tileId ? null : src.tileId));
    },
    [returnToRack],
  );
  const drag = useTileDrag({
    onDrop,
    onTap,
    onHover: (t) => {
      setHoverCell(t.kind === 'cell' ? idx(layout.size, t.x, t.y) : null);
      setHoverRack(t.kind === 'rack');
    },
    disabled: paused || game.phase !== 'active',
    scrollContainer: () => boardScroller.current,
  });

  const onCellActivate = (x: number, y: number) => {
    const k = idx(layout.size, x, y);
    const d = draftMap.get(k);
    if (d) {
      returnToRack(d.tileId);
      return;
    }
    if (game.board[k]) {
      // Tap a placed tile → show the word through it.
      const m = game.moves[game.board[k]!.moveIndex];
      if (m?.words[0]) setWordShown(m.words[0].text);
      return;
    }
    if (!isYourTurn) {
      toast({ tone: 'navy', content: 'Menunggu pemain… bukan giliran anda.' });
      return;
    }
    if (selected) placeTile(selected, x, y);
    else if (rackTiles.length) toast({ tone: 'navy', content: 'Pilih jubin dari rak dahulu, kemudian ketik petak.' }, 1800);
  };

  // ---- actions ------------------------------------------------------------
  const recallOrShuffle = () => {
    if (validDraft.length) {
      setDraft([]);
      fx('tile-snap');
      return;
    }
    const ids = rackTiles.map((t) => t.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    }
    setRackOrder(ids);
    fx('tile-shuffle');
  };

  const onSubmit = () => {
    const res = submitPlay();
    if (!res.ok) {
      setWobble((w) => w + 1);
      fx('word-invalid');
      toast({ tone: 'coral', content: res.error.message }, 3200);
    } else setSelected(null);
  };

  const onHint = () => {
    const h = requestHint();
    if (h === 'none-left') {
      toast({ tone: 'navy', content: 'Bantuan sudah habis untuk tahap ini.' });
      return;
    }
    fx('hint');
    if (!h) {
      toast({ tone: 'mango', content: 'Tiada langkah ditemui dengan rak ini. Cuba TUKAR jubin atau langkau giliran.' }, 3600);
      return;
    }
    setDraft([]);
    setHint(h);
  };

  const applyHint = () => {
    if (!hint) return;
    setDraft(hint.placements);
    setHint(null);
    fx('tile-drop');
  };

  // ---- reactions to applied moves ----------------------------------------
  const lastNonce = useRef(notice?.nonce ?? 0);
  useEffect(() => {
    if (!notice || notice.nonce === lastNonce.current) return;
    lastNonce.current = notice.nonce;
    const ev = notice.event;
    const who = notice.byHuman ? 'Anda' : persona.name;
    if (ev.kind === 'play') {
      const main = ev.words[0]!;
      setWave({ key: notice.nonce, order: main.cells.map((c) => idx(layout.size, c.x, c.y)) });
      fx(ev.words.length > 1 ? 'multi-word-combo' : 'word-valid');
      if (ev.words.some((w) => w.cells.some((c) => c.isNew && c.bonus))) window.setTimeout(() => fx('bonus-cell'), 250);
      toast(
        {
          tone: notice.byHuman ? 'jade' : 'navy',
          onClick: () => setWordShown(main.text),
          content: (
            <span className="flex items-center gap-2">
              <span>{notice.byHuman ? 'Bagus! Perkataan diterima' : `${who} bermain`}</span>
              <JawiText text={main.text} className="text-2xl leading-[1.4] font-bold" />
              <span className="rounded-lg bg-white/20 px-1.5 font-display">+{ev.score}</span>
              {ev.allTilesBonus && <span className="rounded-lg bg-mango-400 px-1.5 text-ink">7 jubin!</span>}
              <span className="text-xs underline opacity-90">makna</span>
            </span>
          ),
        },
        3400,
      );
    } else if (ev.kind === 'swap') {
      fx('tile-swap');
      toast({ tone: 'navy', content: `${who} menukar ${ev.count} jubin.` });
    } else if (ev.kind === 'pass') {
      toast({ tone: 'navy', content: ev.timeout ? `Masa tamat — giliran ${who === 'Anda' ? 'anda' : who} dilangkau.` : `${who} melangkau giliran.` });
    } else if (ev.kind === 'resign') {
      toast({ tone: 'coral', content: `${who} menyerah kalah.` });
    }
    const s = useSingle.getState().game;
    if (s && s.phase === 'active' && !notice.byHuman && s.players[s.currentPlayer]?.id === HUMAN_ID) {
      window.setTimeout(() => fx('turn-start'), 450);
    }
  }, [notice, persona.name, layout.size]);

  // ---- bot loop -------------------------------------------------------------
  useEffect(() => {
    if (game.phase !== 'active' || paused) return;
    const cur = game.players[game.currentPlayer]!;
    if (cur.kind !== 'bot') return;
    const v = game.version;
    fx('bot-thinking');
    const t = window.setTimeout(() => runBotTurn(v), THINK_MS[cur.botLevel ?? 'mudah']);
    return () => window.clearTimeout(t);
  }, [game.version, game.phase, game.currentPlayer, game.players, paused]);

  // ---- turn timer ---------------------------------------------------------------
  useEffect(() => {
    if (!timerOn || !isYourTurn) {
      setTimeLeft(null);
      return;
    }
    setTimeLeft(turnSeconds);
  }, [timerOn, isYourTurn, turnSeconds, game.version]);
  useEffect(() => {
    if (timeLeft === null || paused || !isYourTurn) return;
    if (timeLeft <= 0) {
      setDraft([]);
      passTurn(true);
      fx('error');
      return;
    }
    if (timeLeft <= 10 && timeLeft % 5 === 0) fx('countdown-warning');
    const t = window.setTimeout(() => setTimeLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [timeLeft, paused, isYourTurn, setDraft]);
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && timerOn) setPaused(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [timerOn]);

  // ---- end of game ------------------------------------------------------------
  useEffect(() => {
    if (game.phase !== 'finished') return;
    const t = window.setTimeout(() => navigate('results', { replace: true }), 1300);
    return () => window.clearTimeout(t);
  }, [game.phase]);

  // ---- layout sizes -----------------------------------------------------------
  const tileSize = Math.max(44, Math.min(62, Math.floor(((rackSize.width || 340) - 16 - 6 * 6) / 7)));
  const dragTile = drag.visual ? rackById.get(drag.visual.tileId) : null;
  const dragLetter = dragTile ? (dragTile.isBlank ? (validDraft.find((p) => p.tileId === dragTile.id)?.letter ?? '') : dragTile.letter) : '';
  const hintLimit = HINT_LIMIT[game.difficulty];
  const hintsLeft = hintLimit === null ? null : Math.max(0, hintLimit - hintsUsed);

  const hud = <GameHUD game={game} players={hudPlayers} timeLeft={timeLeft} turnSeconds={timerOn ? turnSeconds : null} />;
  const waiting = game.phase === 'finished' ? 'Permainan tamat!' : !isYourTurn ? `${persona.name} sedang berfikir…` : null;

  return (
    <div className={`app-bg flex h-full overflow-hidden ${wide ? 'flex-row' : 'flex-col'}`} data-testid="game-screen">
      <h1 className="sr-only">Permainan EASY JAWI — tahap {game.difficulty}</h1>
      {/* Board column */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!wide && <div className="safe-top px-2 pt-1.5">{hud}</div>}
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
            interactive={!paused && game.phase === 'active'}
            onCellActivate={onCellActivate}
            bindDraftTile={(id, size) => drag.bind({ tileId: id, from: 'board' }, size)}
            scrollRef={(el) => (boardScroller.current = el)}
          />
          {paused && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-cream-100/95 p-6 text-center" data-testid="paused-overlay">
              <div>
                <Icon name="pause" size={42} className="mx-auto text-navy-800" />
                <h2 className="mt-2 font-display text-2xl font-semibold">Permainan dijeda</h2>
                <p className="mb-4 text-ink-soft">Pemasa dihentikan. Papan disembunyikan.</p>
                <Button tone="jade" size="lg" icon="play" onClick={() => setPaused(false)}>
                  Sambung
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls column */}
      <div className={`safe-bottom flex flex-col gap-1.5 px-2 pt-1.5 ${wide ? 'w-[min(440px,46%)] justify-center overflow-y-auto py-3' : ''}`}>
        {wide && hud}
        {hint ? (
          <div className="flex min-h-[64px] items-center gap-2 rounded-2xl border-2 border-jade-500 bg-jade-100 px-3 py-1.5" data-testid="hint-panel">
            <Icon name="bulb" className="shrink-0 text-jade-700" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-jade-700">Cadangan · +{hint.score} mata</div>
              <JawiText text={hint.mainWord} className="text-2xl leading-[1.4] font-bold text-jade-700" />
              {game.difficulty === 'mudah' && (
                <div className="truncate text-xs text-ink-soft">
                  {lexicon.lookup(hint.mainWord)[0]?.rumi} — {lexicon.lookup(hint.mainWord)[0]?.meaningMs}
                </div>
              )}
            </div>
            <Button tone="jade" onClick={applyHint} data-testid="apply-hint">
              Guna
            </Button>
            <button type="button" onClick={() => setHint(null)} className="grid size-11 place-items-center rounded-full hover:bg-jade-200" aria-label="Tutup cadangan">
              <Icon name="close" />
            </button>
          </div>
        ) : (
          <WordPreview evaluation={evaluation} isYourTurn={isYourTurn} waiting={waiting} lastWord={lastWord} onShowWord={setWordShown} />
        )}
        <div ref={rackBox} className={paused ? 'invisible' : ''}>
          <TileRack
            tiles={rackTiles}
            selectedId={selected}
            bindTile={(id, size) => drag.bind({ tileId: id, from: 'rack' }, size)}
            onKeyActivate={(id) => onTap({ tileId: id, from: 'rack' })}
            tileSize={tileSize}
            showNames={settings.showLetterNames}
            disabled={game.phase !== 'active'}
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
              disabled: paused || game.phase !== 'active',
            },
            {
              id: 'tukar',
              label: 'TUKAR',
              icon: 'swap',
              onClick: () => {
                setDraft([]);
                setSwapSel(new Set());
                setSwapOpen(true);
              },
              disabled: !isYourTurn || paused,
              disabledReason: 'Bukan giliran anda',
            },
            {
              id: 'bantuan',
              label: 'BANTUAN',
              icon: 'bulb',
              onClick: onHint,
              disabled: !isYourTurn || paused || hintsLeft === 0,
              disabledReason: hintsLeft === 0 ? 'Bantuan sudah habis' : 'Bukan giliran anda',
              badge: hintsLeft === null ? '∞' : String(hintsLeft),
            },
            {
              id: 'sahkan',
              label: 'SAHKAN',
              icon: 'check',
              primary: true,
              onClick: onSubmit,
              disabled: !isYourTurn || validDraft.length === 0 || paused,
              disabledReason: !isYourTurn ? 'Bukan giliran anda' : 'Letakkan jubin di papan dahulu',
            },
            { id: 'menu', label: 'MENU', icon: 'menu', onClick: () => setMenuOpen(true) },
          ]}
        />
      </div>

      {/* Drag ghost */}
      {drag.visual && dragTile && (
        <div ref={drag.ghostRef} className="pointer-events-none fixed top-0 left-0 z-[70] drop-shadow-xl" style={{ width: drag.visual.size, height: drag.visual.size }} aria-hidden="true">
          <TileFace letter={dragLetter} value={dragTile.value} isBlank={dragTile.isBlank} size={drag.visual.size} selected />
        </div>
      )}

      <BlankPicker
        open={!!blankFor}
        onCancel={() => setBlankFor(null)}
        onPick={(letter) => {
          const b = blankFor!;
          setBlankFor(null);
          placeTile(b.tileId, b.x, b.y, letter);
        }}
      />

      <Sheet open={swapOpen} onClose={() => setSwapOpen(false)} title="Tukar jubin">
        {canSwap(game, 1) ? (
          <>
            <p className="mb-3 text-sm text-ink-soft">Pilih jubin untuk dipulangkan ke beg. Menukar jubin menamatkan giliran anda (0 mata).</p>
            <div className="mb-4 flex flex-wrap justify-center gap-2" role="group" aria-label="Pilih jubin untuk ditukar">
              {orderedRack(human.rack, rackOrder).map((t) => {
                const on = swapSel.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${t.isBlank ? 'Joker' : t.letter}${on ? ', dipilih' : ''}`}
                    onClick={() => {
                      const n = new Set(swapSel);
                      if (on) n.delete(t.id);
                      else n.add(t.id);
                      setSwapSel(n);
                    }}
                    className={`size-14 rounded-xl transition-transform ${on ? '-translate-y-1.5' : ''}`}
                    data-testid="swap-tile"
                  >
                    <TileFace letter={t.letter} value={t.value} isBlank={t.isBlank} size={56} selected={on} />
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button tone="cream" className="flex-1" onClick={() => setSwapSel(new Set(human.rack.map((t) => t.id)))}>
                Pilih semua
              </Button>
              <Button
                tone="jade"
                className="flex-1"
                disabled={swapSel.size === 0 || !canSwap(game, swapSel.size)}
                onClick={() => {
                  const res = swapTiles([...swapSel]);
                  setSwapOpen(false);
                  if (!res.ok) toast({ tone: 'coral', content: res.error.message });
                }}
                data-testid="confirm-swap"
              >
                Tukar {swapSel.size || ''} jubin
              </Button>
            </div>
          </>
        ) : (
          <div>
            <p className="mb-4 text-ink-soft">
              Beg tinggal <b>{game.bag.length}</b> jubin. Tukar jubin hanya dibenarkan apabila beg ada sekurang-kurangnya <b>{game.rules.minBagForSwap}</b> jubin.
            </p>
            <Button
              tone="navy"
              className="w-full"
              onClick={() => {
                setSwapOpen(false);
                setConfirm('pass');
              }}
            >
              Langkau giliran sahaja
            </Button>
          </div>
        )}
      </Sheet>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu permainan">
        <div className="grid gap-2">
          <MenuItem icon="play" label="Sambung bermain" onClick={() => setMenuOpen(false)} />
          <MenuItem
            icon="pause"
            label="Jeda permainan"
            onClick={() => {
              setMenuOpen(false);
              setPaused(true);
            }}
          />
          <MenuItem
            icon="skip"
            label="Langkau giliran"
            disabled={!isYourTurn}
            onClick={() => {
              setMenuOpen(false);
              setConfirm('pass');
            }}
          />
          <MenuItem
            icon="flag"
            label="Menyerah kalah"
            tone="coral"
            disabled={game.phase !== 'active'}
            onClick={() => {
              setMenuOpen(false);
              setConfirm('resign');
            }}
          />
          <MenuItem icon={settings.soundOn ? 'sound' : 'mute'} label={settings.soundOn ? 'Bunyi: Hidup' : 'Bunyi: Senyap'} onClick={() => settings.set({ soundOn: !settings.soundOn })} />
          <MenuItem icon="book" label="Kamus Jawi" onClick={() => navigate('kamus')} />
          <MenuItem icon="info" label="Cara bermain" onClick={() => navigate('tutorial')} />
          <MenuItem icon="gear" label="Tetapan" onClick={() => navigate('tetapan')} />
          <MenuItem icon="home" label="Laman utama (permainan disimpan)" onClick={() => navigate('home')} />
        </div>
      </Sheet>

      <ConfirmSheet
        open={confirm === 'resign'}
        title="Menyerah kalah?"
        message={`${persona.name} akan diisytiharkan pemenang. Permainan ini tidak boleh disambung semula.`}
        confirmLabel="Ya, menyerah"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          resign();
        }}
      />
      <ConfirmSheet
        open={confirm === 'pass'}
        title="Langkau giliran?"
        message="Anda tidak akan mendapat mata untuk giliran ini."
        confirmLabel="Langkau"
        tone="navy"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          passTurn();
        }}
      />
      <WordDetail word={wordShown} lexicon={lexicon} onClose={() => setWordShown(null)} />
    </div>
  );
}

function MenuItem({ icon, label, onClick, disabled, tone }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onClick: () => void; disabled?: boolean; tone?: 'coral' }) {
  return (
    <button
      type="button"
      onClick={() => {
        fx('button-tap');
        onClick();
      }}
      disabled={disabled}
      className={`flex min-h-12 items-center gap-3 rounded-xl border-2 border-cream-300 bg-white px-4 text-left font-semibold hover:bg-cream-100 disabled:opacity-45 ${tone === 'coral' ? 'text-coral-700' : 'text-ink'}`}
    >
      <Icon name={icon} />
      {label}
    </button>
  );
}
