/**
 * Original sound effects synthesised at runtime with the Web Audio API — no
 * audio files, so there is nothing to license. Each sound is addressable by
 * id. The AudioContext is only created/resumed after a user gesture to comply
 * with browser autoplay policies. Missing Web Audio ⇒ silent fallback.
 */
export type SoundId =
  | 'tile-pickup'
  | 'tile-drop'
  | 'tile-snap'
  | 'tile-shuffle'
  | 'tile-swap'
  | 'board-zoom'
  | 'word-valid'
  | 'word-invalid'
  | 'bonus-cell'
  | 'multi-word-combo'
  | 'turn-start'
  | 'countdown-warning'
  | 'room-join'
  | 'ready-up'
  | 'bot-thinking'
  | 'game-win'
  | 'game-lose'
  | 'tie'
  | 'final-score'
  | 'button-tap'
  | 'hint'
  | 'error';

export const SOUND_LABELS: Record<SoundId, string> = {
  'tile-pickup': 'Angkat jubin',
  'tile-drop': 'Letak jubin',
  'tile-snap': 'Jubin terkunci',
  'tile-shuffle': 'Kocok rak',
  'tile-swap': 'Tukar jubin',
  'board-zoom': 'Zum papan',
  'word-valid': 'Perkataan diterima',
  'word-invalid': 'Perkataan ditolak',
  'bonus-cell': 'Petak bonus',
  'multi-word-combo': 'Kombo banyak perkataan',
  'turn-start': 'Giliran bermula',
  'countdown-warning': 'Amaran masa',
  'room-join': 'Pemain menyertai',
  'ready-up': 'Sedia',
  'bot-thinking': 'Bot berfikir',
  'game-win': 'Menang',
  'game-lose': 'Kalah',
  tie: 'Seri',
  'final-score': 'Markah akhir',
  'button-tap': 'Ketik butang',
  hint: 'Bantuan',
  error: 'Ralat / sambung semula',
};

type Wave = OscillatorType;
interface ToneOpts {
  type?: Wave;
  gain?: number;
  attack?: number;
  slideTo?: number;
}
interface NoiseOpts {
  gain?: number;
  filter?: BiquadFilterType;
  freq?: number;
  sweepTo?: number;
}

class Voice {
  constructor(
    private ctx: AudioContext,
    private out: AudioNode,
    private noiseBuf: AudioBuffer,
  ) {}

  tone(freq: number, at: number, dur: number, o: ToneOpts = {}) {
    const t0 = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + dur);
    const peak = o.gain ?? 0.2;
    const attack = o.attack ?? 0.008;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(at: number, dur: number, o: NoiseOpts = {}) {
    const t0 = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = o.filter ?? 'bandpass';
    filter.frequency.setValueAtTime(o.freq ?? 1200, t0);
    if (o.sweepTo) filter.frequency.exponentialRampToValueAtTime(o.sweepTo, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.15, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.out);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  arpeggio(freqs: number[], at: number, step: number, dur: number, o: ToneOpts = {}) {
    freqs.forEach((f, i) => this.tone(f, at + i * step, dur, o));
  }
}

// Pentatonic-friendly note table (Hz)
const N = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, D6: 1174.66, E6: 1318.5, G6: 1567.98 };

const RECIPES: Record<SoundId, (v: Voice) => void> = {
  'tile-pickup': (v) => v.tone(820, 0, 0.08, { type: 'triangle', gain: 0.12, slideTo: 1080 }),
  'tile-drop': (v) => {
    v.noise(0, 0.06, { gain: 0.18, filter: 'lowpass', freq: 900 });
    v.tone(240, 0, 0.09, { gain: 0.2, slideTo: 170 });
  },
  'tile-snap': (v) => {
    v.tone(1400, 0, 0.035, { type: 'square', gain: 0.04 });
    v.tone(700, 0.015, 0.06, { type: 'triangle', gain: 0.12 });
  },
  'tile-shuffle': (v) => {
    for (let i = 0; i < 6; i++) v.noise(i * 0.04, 0.035, { gain: 0.12, freq: 1800 + i * 220 });
  },
  'tile-swap': (v) => v.noise(0, 0.32, { gain: 0.16, freq: 400, sweepTo: 2600 }),
  'board-zoom': (v) => v.tone(540, 0, 0.035, { gain: 0.04 }),
  'word-valid': (v) => v.arpeggio([N.C5, N.E5, N.G5, N.C6], 0, 0.07, 0.2, { type: 'triangle', gain: 0.16 }),
  'word-invalid': (v) => {
    v.tone(330, 0, 0.12, { type: 'triangle', gain: 0.16, slideTo: 270 });
    v.tone(250, 0.12, 0.2, { type: 'triangle', gain: 0.16, slideTo: 210 });
  },
  'bonus-cell': (v) => v.arpeggio([N.G6, 2093, 2637], 0, 0.05, 0.14, { gain: 0.07 }),
  'multi-word-combo': (v) => {
    v.arpeggio([N.C5, N.E5, N.G5, N.C6], 0, 0.06, 0.18, { type: 'triangle', gain: 0.14 });
    v.arpeggio([N.D5, N.G5, N.A5, N.D6], 0.26, 0.06, 0.2, { type: 'triangle', gain: 0.14 });
  },
  'turn-start': (v) => {
    v.tone(N.E5, 0, 0.14, { gain: 0.14 });
    v.tone(N.A5, 0.1, 0.22, { gain: 0.14 });
  },
  'countdown-warning': (v) => {
    v.tone(980, 0, 0.05, { type: 'square', gain: 0.04 });
    v.tone(740, 0.16, 0.05, { type: 'square', gain: 0.04 });
  },
  'room-join': (v) => v.arpeggio([N.C5, N.E5, N.G5], 0, 0.08, 0.16, { gain: 0.14 }),
  'ready-up': (v) => v.arpeggio([N.G5, N.C6], 0, 0.07, 0.12, { type: 'triangle', gain: 0.14 }),
  'bot-thinking': (v) => {
    v.tone(300, 0, 0.26, { gain: 0.06, slideTo: 345 });
    v.tone(345, 0.26, 0.26, { gain: 0.06, slideTo: 300 });
  },
  'game-win': (v) => {
    v.arpeggio([N.C5, N.E5, N.G5, N.C6, N.E6], 0, 0.11, 0.2, { type: 'triangle', gain: 0.16 });
    for (const f of [N.C5, N.E5, N.G5, N.C6]) v.tone(f, 0.6, 0.7, { type: 'triangle', gain: 0.08, attack: 0.03 });
  },
  'game-lose': (v) => v.arpeggio([392, 349.23, 329.63, 261.63], 0, 0.16, 0.3, { type: 'triangle', gain: 0.12 }),
  tie: (v) => {
    for (const f of [N.C5, N.E5]) v.tone(f, 0, 0.3, { type: 'triangle', gain: 0.1 });
    for (const f of [N.D5, N.G5]) v.tone(f, 0.3, 0.4, { type: 'triangle', gain: 0.1 });
  },
  'final-score': (v) => {
    v.tone(988, 0, 0.08, { type: 'square', gain: 0.05 });
    v.tone(1319, 0.08, 0.22, { type: 'square', gain: 0.05 });
  },
  'button-tap': (v) => v.tone(620, 0, 0.04, { gain: 0.07 }),
  hint: (v) => {
    v.tone(N.D6, 0, 0.45, { gain: 0.1, attack: 0.005 });
    v.tone(1760, 0.04, 0.35, { gain: 0.05 });
  },
  error: (v) => {
    v.tone(262, 0, 0.16, { type: 'triangle', gain: 0.14 });
    v.tone(196, 0.16, 0.22, { type: 'triangle', gain: 0.14 });
  },
};

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voice: Voice | null = null;
  enabled = true;
  private vol = 0.7;

  /** Must be called from a user gesture handler. Safe to call repeatedly. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC: typeof AudioContext | undefined =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.vol;
        this.master.connect(this.ctx.destination);
        const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.voice = new Voice(this.ctx, this.master, buf);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  get unlocked() {
    return this.ctx?.state === 'running';
  }

  setVolume(v: number) {
    this.vol = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.vol, this.ctx.currentTime, 0.02);
  }

  play(id: SoundId) {
    if (!this.enabled || this.vol <= 0 || !this.voice || this.ctx?.state !== 'running') return;
    try {
      RECIPES[id](this.voice);
    } catch {
      /* never let audio break gameplay */
    }
  }
}

export const sound = new SoundEngine();
