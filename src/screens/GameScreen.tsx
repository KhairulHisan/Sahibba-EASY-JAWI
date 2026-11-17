import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionBar } from '../components/ActionBar';
import { BlankPicker } from '../components/BlankPicker';
import { Board } from '../components/Board';
import { Button } from '../components/Button';
import { GameHUD, type HudPlayer } from '../components/GameHUD';
import { Icon } from '../components/Icon';
import { JawiText } from '../components/JawiText';
import { MenuItem } from '../components/MenuItem';
import { ConfirmSheet, Sheet } from '../components/Sheet';
import { TileRack } from '../components/TileRack';
import { toast } from '../components/Toast';
import { WordDetail } from '../components/WordDetail';
import { WordPreview } from '../components/WordPreview';
import { getLayout, idx } from '../engine/board';
import type { MoveCandidate } from '../engine/bot';
import { evaluatePlay, lastPlayedWord } from '../engine/game';
import {
  activeLexicon,
  passTurn,
  requestHint,
  resign,
  runBotTurn,
  submitPlayChecked,
  swapTiles,
} from '../features/single/controller';
import { knownVerified, useDictCache } from '../features/dictionary/cacheStore';
import { SUGGEST_MESSAGE, suggestWord, type SuggestResult } from '../features/dictionary/firebaseBackend';
import { OnlineCheckPanel, type OnlineCheckState } from '../features/dictionary/OnlineCheckPanel';
import { lexiconWithOnline } from '../features/dictionary/preparePlay';
import { ONLINE_DICTIONARY_AVAILABLE, dictionaryChecker } from '../features/dictionary/service';
import { messageFor, type WordCheck } from '../dictionary/protocol';
import { BOT_PERSONA, HINT_LIMIT, HUMAN_ID, orderedRack, useSingle } from '../features/single/store';
import { SwapSheet } from '../features/play/SwapSheet';
import { useTileTable } from '../features/play/useTileTable';
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

  const baseLexicon = useMemo(() => activeLexicon(), [packIds]);
  // Smart Online Dictionary (Single Player only): words already verified online count as known.
  const smartOn = settings.smartDictionary && ONLINE_DICTIONARY_AVAILABLE;
  const dictEntries = useDictCache((c) => c.entries);
  const lexicon = useMemo(() => (smartOn ? lexiconWithOnline(baseLexicon, knownVerified(dictEntries)) : baseLexicon), [smartOn, baseLexicon, dictEntries]);
  const [check, setCheck] = useState<OnlineCheckState | null>(null);
  const [suggestState, setSuggestState] = useState<Record<string, 'sending' | SuggestResult>>({});
  const checking = check?.phase === 'checking';
  const layout = getLayout(game.rules.layoutId);
  const humanIdx = game.players.findIndex((p) => p.id === HUMAN_ID);
  const human = game.players[humanIdx]!;
  const botPlayer = game.players.find((p) => p.kind === 'bot')!;
  const persona = BOT_PERSONA[game.difficulty];
  const isYourTurn = game.phase === 'active' && game.currentPlayer === humanIdx;

  const [wave, setWave] = useState<{ key: number; order: number[] } | null>(null);
  const [hint, setHint] = useState<MoveCandidate | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'resign' | 'pass'>(null);
  const [wordShown, setWordShown] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const boardScroller = useRef<HTMLDivElement | null>(null);
  const [rackBox, rackSize] = useElementSize<HTMLDivElement>();

  const wide = useMediaQuery(WIDE_LAYOUT);
  const timerOn = turnSeconds !== null && settings.timersAllowed;

  // ---- table (draft, rack, drag & drop) — shared with multiplayer ---------
  const clearHint = useCallback(() => setHint(null), []);
  const table = useTileTable({
    layout,
    board: game.board,
    rack: human.rack,
    isYourTurn: isYourTurn && !checking,
    interactive: !paused && !checking && game.phase === 'active',
    draft,
    setDraft,
    rackOrder,
    setRackOrder,
    scrollContainer: () => boardScroller.current,
    onPlacedTileTap: (k) => {
      const m = game.moves[game.board[k]!.moveIndex];
      if (m?.words[0]) setWordShown(m.words[0].text);
    },
    onPlaced: clearHint,
  });
  const { rackById, validDraft, draftMap, rackTiles, selected, setSelected, wobble, hoverCell, hoverRack, drag, onCellActivate, recallOrShuffle } = table;
  useEffect(() => {
    if (validDraft.length !== draft.length) setDraft(validDraft);
  }, [validDraft, draft.length, setDraft]);

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

  // ---- SAHKAN (with the optional Smart Online Dictionary) -------------------
  const submitting = useRef(false);
  const abortCheck = useRef<AbortController | null>(null);
  const closeCheck = useCallback(() => {
    setCheck(null);
    setSuggestState({});
  }, []);
  const onSubmit = async (fresh = false) => {
    if (submitting.current) return;
    submitting.current = true;
    const ctl = new AbortController();
    abortCheck.current = ctl;
    try {
      const out = await submitPlayChecked({
        signal: ctl.signal,
        fresh,
        onChecking: (words) => {
          setSuggestState({});
          setCheck({ phase: 'checking', words });
          fx('bot-thinking');
        },
      });
      if (!mounted.current) return;
      if (out.kind === 'played') {
        closeCheck();
        setSelected(null);
      } else if (out.kind === 'blocked') {
        setCheck({ phase: 'result', checks: out.checks });
        table.bumpWobble();
        fx(out.checks.some((c) => c.status === 'SERVICE_UNAVAILABLE') ? 'error' : 'word-invalid');
      } else if (out.kind === 'rejected') {
        closeCheck();
        table.bumpWobble();
        fx('word-invalid');
        toast({ tone: 'coral', content: out.error.message }, 3200);
      } else closeCheck();
    } finally {
      submitting.current = false;
      abortCheck.current = null;
    }
  };

  const onSuggest = async (c: WordCheck) => {
    setSuggestState((s) => ({ ...s, [c.key]: 'sending' }));
    const context = check?.phase === 'result' ? check.checks.map((x) => x.key) : [];
    const r = await suggestWord(c.key, context);
    if (!mounted.current) return;
    setSuggestState((s) => ({ ...s, [c.key]: r }));
    toast({ tone: r === 'sent' ? 'jade' : r === 'error' ? 'coral' : 'navy', content: SUGGEST_MESSAGE[r] }, 3800);
    if (r === 'sent' || r === 'already') {
      dictionaryChecker().markPending(c.word, c.key);
      setCheck((cur) =>
        cur?.phase === 'result'
          ? { phase: 'result', checks: cur.checks.map((x) => (x.key === c.key ? { ...x, status: 'PENDING_REVIEW', message: messageFor('PENDING_REVIEW') } : x)) }
          : cur,
      );
    }
  };

  // The result panel belongs to the move it judged: moving a tile or a new turn closes it.
  const checkRef = useRef(check);
  checkRef.current = check;
  useEffect(() => {
    if (checkRef.current?.phase === 'result') closeCheck();
  }, [draft, game.version, closeCheck]);

  const onHint = async () => {
    if (hintLoading) return;
    setHintLoading(true);
    const h = await requestHint(() => pausedRef.current || !mounted.current).finally(() => mounted.current && setHintLoading(false));
    if (h === 'stale') return;
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
              {notice.byHuman && useSingle.getState().onlineLog.some((l) => l.moveIndex === useSingle.getState().game!.moves.length - 1) && (
                <span className="rounded-lg bg-white/20 px-1.5 text-xs" data-testid="online-verified-badge">
                  ✓ Kamus Online
                </span>
              )}
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
    let cancelled = false;
    const t = window.setTimeout(() => void runBotTurn(v, () => cancelled), THINK_MS[cur.botLevel ?? 'mudah']);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [game.version, game.phase, game.currentPlayer, game.players, paused]);

  // ---- turn timer ---------------------------------------------------------------
  // Deadline-based countdown: remaining time is always derived from the clock,
  // so a busy main thread or a throttled tab cannot make the timer drift.
  const deadline = useRef<number | null>(null);
  const remainingOnPause = useRef<number | null>(null);
  useEffect(() => {
    if (!timerOn || !isYourTurn) {
      deadline.current = null;
      remainingOnPause.current = null;
      setTimeLeft(null);
      return;
    }
    deadline.current = Date.now() + (turnSeconds ?? 0) * 1000;
    remainingOnPause.current = null;
    setTimeLeft(turnSeconds);
  }, [timerOn, isYourTurn, turnSeconds, game.version]);
  const frozen = paused || checking; // a dictionary lookup never costs the player time
  useEffect(() => {
    if (deadline.current === null) return;
    if (frozen) {
      remainingOnPause.current ??= Math.max(0, deadline.current - Date.now());
      return;
    }
    if (remainingOnPause.current !== null) {
      deadline.current = Date.now() + remainingOnPause.current;
      remainingOnPause.current = null;
    }
    let lastShown = -1;
    let expired = false;
    const tick = () => {
      if (deadline.current === null || expired) return;
      const left = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      if (left !== lastShown) {
        lastShown = left;
        setTimeLeft(left);
        if (left > 0 && left <= 10 && left % 5 === 0) fx('countdown-warning');
      }
      if (left === 0) {
        expired = true;
        setDraft([]);
        passTurn(true);
        fx('error');
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [frozen, isYourTurn, timerOn, game.version, setDraft]);
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
        {check ? (
          <OnlineCheckPanel
            state={check}
            suggest={suggestState}
            onCancel={() => abortCheck.current?.abort()}
            onRetry={() => void onSubmit(true)}
            onClose={closeCheck}
            onSuggest={(c) => void onSuggest(c)}
          />
        ) : hint ? (
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
          <WordPreview evaluation={evaluation} isYourTurn={isYourTurn} waiting={waiting} lastWord={lastWord} onShowWord={setWordShown} onlineCheck={smartOn} />
        )}
        <div ref={rackBox} className={paused ? 'invisible' : ''}>
          <TileRack
            tiles={rackTiles}
            selectedId={selected}
            bindTile={(id, size) => drag.bind({ tileId: id, from: 'rack' }, size)}
            onKeyActivate={(id) => table.onTap({ tileId: id, from: 'rack' })}
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
              disabled: paused || checking || game.phase !== 'active',
            },
            {
              id: 'tukar',
              label: 'TUKAR',
              icon: 'swap',
              onClick: () => {
                setDraft([]);
                setSwapOpen(true);
              },
              disabled: !isYourTurn || paused || checking,
              disabledReason: 'Bukan giliran anda',
            },
            {
              id: 'bantuan',
              label: hintLoading ? 'MENCARI…' : 'BANTUAN',
              icon: 'bulb',
              onClick: () => void onHint(),
              disabled: !isYourTurn || paused || checking || hintsLeft === 0 || hintLoading,
              disabledReason: hintsLeft === 0 ? 'Bantuan sudah habis' : 'Bukan giliran anda',
              badge: hintsLeft === null ? '∞' : String(hintsLeft),
            },
            {
              id: 'sahkan',
              label: checking ? 'SEMAK…' : 'SAHKAN',
              icon: 'check',
              primary: true,
              onClick: () => void onSubmit(),
              disabled: !isYourTurn || validDraft.length === 0 || paused || checking,
              disabledReason: !isYourTurn ? 'Bukan giliran anda' : 'Letakkan jubin di papan dahulu',
            },
            { id: 'menu', label: 'MENU', icon: 'menu', onClick: () => setMenuOpen(true) },
          ]}
        />
      </div>

      {/* Drag ghost */}
      {table.ghost}

      <BlankPicker
        open={!!table.blankFor}
        onCancel={() => table.setBlankFor(null)}
        onPick={table.pickBlankLetter}
      />

      <SwapSheet
        open={swapOpen}
        onClose={() => setSwapOpen(false)}
        tiles={orderedRack(human.rack, rackOrder)}
        bagCount={game.bag.length}
        minBagForSwap={game.rules.minBagForSwap}
        onSwap={(ids) => {
          const res = swapTiles(ids);
          setSwapOpen(false);
          if (!res.ok) toast({ tone: 'coral', content: res.error.message });
        }}
        onPassInstead={() => {
          setSwapOpen(false);
          setConfirm('pass');
        }}
      />

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
          {ONLINE_DICTIONARY_AVAILABLE && (
            <MenuItem icon="search" label={smartOn ? 'Kamus Online Pintar: Hidup' : 'Kamus Online Pintar: Mati'} onClick={() => settings.set({ smartDictionary: !settings.smartDictionary })} />
          )}
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
