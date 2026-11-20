import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Board, type DraftCell } from '../components/Board';
import { Button } from '../components/Button';
import { JawiText } from '../components/JawiText';
import { ScreenHeader } from '../components/ScreenHeader';
import { TileFace } from '../components/Tile';
import { TileRack } from '../components/TileRack';
import { WordDetail } from '../components/WordDetail';
import { TILE_DISTRIBUTION, coreLexicon } from '../data';
import { getLayout, idx } from '../engine/board';
import { applyAction, createGame, evaluatePlay } from '../engine/game';
import type { GameState, Placement, Tile } from '../engine/types';
import { useTileDrag, type DragSource, type DropTarget } from '../features/single/useTileDrag';
import { fx } from '../lib/feedback';
import { navigate } from '../state/router';
import { useSettings } from '../state/settings';

interface Target {
  x: number;
  y: number;
  letter: string;
}

const STEP1: Target[] = [
  { x: 7, y: 6, letter: 'ب' },
  { x: 6, y: 6, letter: 'و' },
  { x: 5, y: 6, letter: 'ک' },
  { x: 4, y: 6, letter: 'و' },
];
const STEP2: Target[] = [
  { x: 7, y: 7, letter: 'ا' },
  { x: 7, y: 8, letter: 'ت' },
  { x: 7, y: 9, letter: 'و' },
];

const t = (id: string, letter: string): Tile => {
  const spec = TILE_DISTRIBUTION.tiles.find((s) => s.letter === letter);
  return { id, letter, value: spec?.value ?? 1, isBlank: false };
};

function makeTutorialGame(): GameState {
  const g = createGame({
    id: 'tutorial',
    players: [
      { id: 'anda', name: 'Anda', kind: 'human' },
      { id: 'bot', name: 'Sang Kancil', kind: 'bot', botLevel: 'mudah' },
    ],
    difficulty: 'mudah',
    distribution: TILE_DISTRIBUTION,
    seed: 2024,
  });
  g.players[0]!.rack = [t('u1', 'و'), t('u2', 'س'), t('u3', 'ک'), t('u4', 'ب'), t('u5', 'ت'), t('u6', 'و'), t('u7', 'ا')];
  // Known next draws so step 2 is always possible: و ن ي ا (drawn from the end).
  g.bag = [...g.bag.slice(0, -4), t('u8', 'ا'), t('u9', 'ي'), t('u10', 'ن'), t('u11', 'و')];
  return g;
}

type Phase = 'intro' | 'step1' | 'confirm1' | 'step2' | 'confirm2' | 'done';

export function Tutorial() {
  const lexicon = coreLexicon();
  const layout = getLayout('wau-13');
  const showNames = useSettings((s) => s.showLetterNames);
  const markSeen = useSettings((s) => s.set);
  const [game, setGame] = useState<GameState>(makeTutorialGame);
  const [phase, setPhase] = useState<Phase>('intro');
  const [draft, setDraft] = useState<Placement[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [wave, setWave] = useState<{ key: number; order: number[] } | null>(null);
  const [word, setWord] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  const targets = phase === 'step1' || phase === 'confirm1' ? STEP1 : phase === 'step2' || phase === 'confirm2' ? STEP2 : [];
  const human = game.players[0]!;
  const rackById = useMemo(() => new Map(human.rack.map((x) => [x.id, x])), [human.rack]);
  const draftIds = new Set(draft.map((p) => p.tileId));
  const rackTiles = human.rack.filter((x) => !draftIds.has(x.id));
  const draftMap = new Map<number, DraftCell>();
  for (const p of draft) {
    const tile = rackById.get(p.tileId)!;
    draftMap.set(idx(13, p.x, p.y), { tileId: tile.id, letter: tile.letter, value: tile.value, isBlank: false });
  }
  const nextTarget = targets.find((tg) => !draftMap.has(idx(13, tg.x, tg.y)));
  const targetCells = new Set(nextTarget ? [idx(13, nextTarget.x, nextTarget.y)] : []);
  const evaluation = draft.length ? evaluatePlay(game, 0, draft, lexicon) : null;
  const partial = draft.length
    ? STEP1.concat(STEP2)
        .filter((tg) => draftMap.has(idx(13, tg.x, tg.y)))
        .map((tg) => tg.letter)
        .join('')
    : '';

  const place = useCallback(
    (tileId: string, x: number, y: number) => {
      const tile = rackById.get(tileId);
      const target = targets.find((tg) => tg.x === x && tg.y === y);
      if (!tile) return;
      if (!target || draftMap.has(idx(13, x, y))) {
        fx('word-invalid');
        setMessage(nextTarget ? `Letakkan huruf ${nextTarget.letter} pada petak yang berkelip.` : 'Semua huruf sudah diletakkan.');
        return;
      }
      if (target.letter !== tile.letter) {
        fx('word-invalid');
        setMessage(`Petak ini memerlukan huruf ${target.letter}, bukan ${tile.letter}.`);
        return;
      }
      setMessage(null);
      setSelected(null);
      const next = [...draft.filter((p) => p.tileId !== tileId), { tileId, x, y }];
      setDraft(next);
      fx('tile-drop');
      if (next.length === targets.length) setPhase(phase === 'step1' ? 'confirm1' : 'confirm2');
    },
    [rackById, targets, draftMap, nextTarget, draft, phase],
  );

  const drag = useTileDrag({
    onDrop: (src: DragSource, target: DropTarget) => {
      if (target.kind === 'cell') place(src.tileId, target.x, target.y);
    },
    onTap: (src: DragSource) => {
      if (src.from === 'board') return;
      fx('tile-pickup');
      setSelected((s) => (s === src.tileId ? null : src.tileId));
    },
    disabled: !(phase === 'step1' || phase === 'step2'),
    scrollContainer: () => scroller.current,
  });

  const confirm = () => {
    const res = applyAction(game, { type: 'PLAY', id: `tut-${phase}`, playerId: 'anda', expectedVersion: game.version, placements: draft }, lexicon);
    if (!res.ok) {
      setMessage(res.error.message);
      return;
    }
    let s = res.state;
    // Demo opponent passes so the learner can continue.
    const pass = applyAction(s, { type: 'PASS', id: `tut-pass-${phase}`, playerId: 'bot', expectedVersion: s.version }, lexicon);
    if (pass.ok) s = pass.state;
    const main = res.ok && res.event.kind === 'play' ? res.event.words[0]! : null;
    setGame(s);
    setDraft([]);
    fx('word-valid');
    if (main) {
      setWave({ key: Date.now(), order: main.cells.map((c) => idx(13, c.x, c.y)) });
      window.setTimeout(() => setWord(main.text), 700);
    }
    setPhase(phase === 'confirm1' ? 'step2' : 'done');
  };

  const text: Record<Phase, { title: string; body: React.ReactNode }> = {
    intro: {
      title: 'Jawi dibaca dari kanan ke kiri',
      body: (
        <>
          <p>
            Dalam EASY JAWI, perkataan <b>mendatar</b> dibaca dari <b>KANAN → KIRI</b>, dan perkataan <b>menegak</b> dari <b>ATAS → BAWAH</b>. Mari bina perkataan pertama!
          </p>
          <div className="mt-3 flex items-center justify-center gap-3" aria-hidden="true">
            <motion.span animate={{ x: [12, -12] }} transition={{ repeat: Infinity, repeatType: 'reverse', duration: 0.9 }} className="text-3xl text-jade-600">
              ←
            </motion.span>
            <JawiText text="بوکو" className="text-4xl font-bold" />
          </div>
        </>
      ),
    },
    step1: {
      title: 'Langkah 1: bina بوکو (buku)',
      body: (
        <p>
          Perkataan pertama mesti melalui petak <b>★</b>. Mulakan dari <b>kanan</b>: ketik jubin <b>{nextTarget?.letter}</b> di rak, kemudian ketik petak yang berkelip (atau seret jubin ke situ).
        </p>
      ),
    },
    confirm1: {
      title: 'Hebat! Lihat pratonton',
      body: (
        <p>
          Huruf yang berasingan di papan kini bersambung menjadi <JawiText text="بوکو" className="text-xl font-bold" />. ب dan ک berada di petak <b>2×H</b> (huruf ganda dua) dan و di petak <b>★ 2×P</b> (perkataan ganda dua). Tekan <b>SAHKAN</b>.
        </p>
      ),
    },
    step2: {
      title: 'Langkah 2: perkataan menegak باتو (batu)',
      body: (
        <p>
          Gunakan huruf <b>ب</b> yang sudah ada di papan. Perkataan menegak dibaca dari <b>atas ke bawah</b>: letakkan <b>{nextTarget?.letter}</b> pada petak yang berkelip.
        </p>
      ),
    },
    confirm2: {
      title: 'Bagus! Sahkan perkataan kedua',
      body: <p>Bonus petak hanya dikira untuk jubin baharu — huruf ب yang sedia ada dikira pada nilai asalnya sahaja.</p>,
    },
    done: {
      title: 'Anda sudah bersedia!',
      body: (
        <ul className="grid gap-1.5 text-sm">
          <li>
            • <b>Joker</b> (jubin putih) boleh menjadi apa-apa huruf — bernilai 0.
          </li>
          <li>
            • <b>TUKAR</b> jubin jika rak sukar dimainkan (menamatkan giliran).
          </li>
          <li>
            • <b>BANTUAN</b> mencadangkan langkah sah daripada kamus.
          </li>
          <li>• Guna kesemua 7 jubin sekali gus untuk bonus +40!</li>
          <li>• Ketik mana-mana perkataan untuk melihat makna.</li>
        </ul>
      ),
    },
  };

  const step = text[phase];
  const showBoard = phase !== 'intro';

  return (
    <div className="app-bg flex h-full flex-col overflow-hidden" data-testid="tutorial">
      <ScreenHeader title="Cara Bermain" />
      <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col gap-2 px-3 pb-3">
        <AnimatePresence mode="wait">
          <motion.section key={phase} className="card p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.22 }} aria-live="polite">
            <h2 className="mb-1 font-display text-xl font-semibold text-navy-900">{step.title}</h2>
            <div className="text-ink-soft">{step.body}</div>
            {message && <p className="mt-2 rounded-xl bg-coral-100 px-3 py-2 font-semibold text-coral-700">{message}</p>}
          </motion.section>
        </AnimatePresence>

        {showBoard && (
          <>
            <div className="min-h-[220px] flex-1">
              <Board
                layout={layout}
                cells={game.board}
                draft={draftMap}
                draftState={evaluation?.ok ? 'ok' : 'neutral'}
                targetCells={phase === 'step1' || phase === 'step2' ? targetCells : undefined}
                wave={wave}
                interactive={phase === 'step1' || phase === 'step2'}
                onCellActivate={(x, y) => {
                  if (selected) place(selected, x, y);
                  else setMessage(`Ketik jubin ${nextTarget?.letter ?? ''} di rak dahulu.`);
                }}
                scrollRef={(el) => (scroller.current = el)}
                minZoom={1.4}
                label="Papan latihan"
              />
            </div>
            <div className="flex min-h-14 items-center justify-between gap-2 rounded-2xl border-2 border-cream-300 bg-cream-50 px-3 py-1" aria-live="polite" data-testid="tutorial-preview">
              {evaluation?.ok ? (
                <>
                  <JawiText text={evaluation.words[0]!.text} className="text-3xl leading-[1.5] font-bold text-jade-700" />
                  <span className="rounded-xl bg-jade-500 px-3 py-1 font-display text-xl font-bold text-white">+{evaluation.score}</span>
                </>
              ) : partial ? (
                <>
                  <JawiText text={partial} className="text-3xl leading-[1.5] font-bold text-navy-700" />
                  <span className="text-sm text-ink-soft">sedang dibina…</span>
                </>
              ) : (
                <span className="text-ink-soft">Pratonton perkataan akan muncul di sini.</span>
              )}
            </div>
            {phase !== 'done' && (
              <TileRack
                tiles={rackTiles}
                selectedId={selected}
                bindTile={(id, size) => drag.bind({ tileId: id, from: 'rack' }, size)}
                onKeyActivate={(id) => setSelected((s) => (s === id ? null : id))}
                tileSize={46}
                showNames={showNames}
                disabled={!(phase === 'step1' || phase === 'step2')}
              />
            )}
          </>
        )}

        <div className="flex gap-2">
          {phase === 'intro' && (
            <Button tone="jade" size="lg" className="flex-1" onClick={() => setPhase('step1')} data-testid="tutorial-next">
              Seterusnya
            </Button>
          )}
          {(phase === 'confirm1' || phase === 'confirm2') && (
            <Button tone="jade" size="lg" icon="check" className="flex-1" onClick={confirm} data-testid="tutorial-confirm">
              SAHKAN
            </Button>
          )}
          {phase === 'done' && (
            <>
              <Button
                tone="jade"
                size="lg"
                icon="play"
                className="flex-1"
                onClick={() => {
                  markSeen({ seenTutorial: true });
                  navigate('single', { replace: true });
                }}
                data-testid="tutorial-finish"
              >
                Mula bermain
              </Button>
              <Button
                tone="cream"
                size="lg"
                onClick={() => {
                  setGame(makeTutorialGame());
                  setPhase('intro');
                  setWave(null);
                }}
              >
                Ulang
              </Button>
            </>
          )}
        </div>
      </div>
      {drag.visual && rackById.get(drag.visual.tileId) && (
        <div ref={drag.ghostRef} className="pointer-events-none fixed top-0 left-0 z-[70]" style={{ width: drag.visual.size, height: drag.visual.size }} aria-hidden="true">
          <TileFace letter={rackById.get(drag.visual.tileId)!.letter} value={rackById.get(drag.visual.tileId)!.value} size={drag.visual.size} selected />
        </div>
      )}
      <WordDetail word={word} lexicon={lexicon} onClose={() => setWord(null)} />
    </div>
  );
}
