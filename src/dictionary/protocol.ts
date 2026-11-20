/**
 * Smart Online Jawi Dictionary — contract shared by the browser and the
 * Cloud Function `validateJawiWordOnline`. Pure types, constants and the
 * normalisation key. No network code here.
 *
 * Firestore layout
 *   dictionary/{key}                 central dictionary entry (admin-reviewed)   read: signed in · write: admins
 *   dictionaryAudit/{id}             who changed what, when, why                 read/create: admins
 *   wordSuggestions/{key}            aggregated player suggestion (no names)     get: signed in · list/review: admins
 *   wordSuggestions/{key}/by/{uid}   one suggestion per player per word          create: that player (rules-limited)
 *   suggestQuota/{uid}               per-player suggestion rate limit            rules-enforced
 *   admins/{uid}                     admin allow-list (created in the console)   get: self
 *   dictionaryCache/{provider__key}  server cache of provider verdicts           no client access
 *   dictRateLimits/{uid}             server rate limit for the function          no client access
 */
import { JAWI_LETTER_SET, normalizeJawi } from '../engine/jawi';

export type WordStatus = 'VALID' | 'INVALID' | 'NOT_FOUND' | 'PENDING_REVIEW' | 'SERVICE_UNAVAILABLE';

/** How a verdict was reached. Only these can ever make a word playable. */
export type CheckMethod = 'local' | 'central-dictionary' | 'provider' | 'none';

export interface DictionarySource {
  /** Stable machine id, e.g. "local-teras", "kamus-pusat", "provider-xyz". */
  id: string;
  /** Human-readable name of the authority (e.g. the reference work an admin checked). */
  name: string;
  /** Edition / data version of that source. */
  version: string;
  licence?: string;
}

export interface CheckEvidence {
  method: CheckMethod;
  /** When this verdict was produced (ms since epoch). */
  checkedAt: number;
  /** Admin review: reviewer uid, time and note (e.g. dictionary page). */
  reviewedBy?: string;
  reviewedAt?: number;
  note?: string;
  /** Provider's own entry id / reference. */
  reference?: string;
  /** Central dictionary entry revision. */
  revision?: number;
}

export interface WordCheck {
  /** Word as it appeared on the board. */
  word: string;
  /** Normalised key (see dictionaryKey). */
  key: string;
  status: WordStatus;
  message: string;
  source?: DictionarySource;
  evidence?: CheckEvidence;
  rumi?: string;
  meaningMs?: string;
  /** INVALID: why it was rejected. */
  reason?: string;
  /** Served from a cache rather than a fresh lookup. */
  cached?: boolean;
}

export const DICT_LIMITS = {
  minLength: 2,
  maxLength: 15,
  /** Words per function call (a single move rarely forms more than 4). */
  maxWordsPerRequest: 8,
  /** Context words stored with a suggestion. */
  maxContextWords: 6,
} as const;

export const DICT_TIMING = {
  firestoreTimeoutMs: 5_000,
  functionTimeoutMs: 8_000,
  /** Hard cap for one whole check, whatever happens. */
  overallTimeoutMs: 12_000,
  /** Device cache of authoritative verdicts. */
  validTtlMs: 72 * 60 * 60 * 1000,
  invalidTtlMs: 72 * 60 * 60 * 1000,
  /** NOT_FOUND / PENDING_REVIEW are only remembered briefly (an admin may approve soon). */
  negativeTtlMs: 2 * 60 * 1000,
  /** Server cache of provider verdicts. */
  serverPositiveTtlMs: 30 * 24 * 60 * 60 * 1000,
  serverNotFoundTtlMs: 24 * 60 * 60 * 1000,
  providerTimeoutMs: 5_000,
} as const;

/** Device-side throttle: online lookups per window. */
export const CLIENT_RATE = { max: 40, windowMs: 5 * 60_000 } as const;
/** Server-side throttle per user (words looked up). */
export const SERVER_RATE = { max: 60, windowMs: 10 * 60_000, dailyMax: 400 } as const;

export const LOCAL_SOURCE: DictionarySource = { id: 'local-teras', name: 'Kamus lokal EASY JAWI', version: 'teras' };
export const CENTRAL_SOURCE_ID = 'kamus-pusat';

export const STATUS_LABEL: Record<WordStatus, string> = {
  VALID: 'Sah',
  INVALID: 'Tidak diterima',
  NOT_FOUND: 'Tidak ditemui',
  PENDING_REVIEW: 'Menunggu semakan',
  SERVICE_UNAVAILABLE: 'Tiada sambungan',
};

export const REJECT_REASONS = {
  'ejaan-salah': 'Ejaan salah',
  'bukan-perkataan': 'Bukan perkataan Bahasa Melayu',
  'nama-khas': 'Nama khas / singkatan',
  'tidak-sesuai': 'Tidak sesuai untuk permainan',
  lain: 'Lain-lain',
} as const;
export type RejectReason = keyof typeof REJECT_REASONS;

/**
 * Normalised dictionary key for a word: the project's canonical Jawi
 * normalisation (normalizeJawi), then every letter must be a tile letter.
 * Returns null for anything else (spaces, Latin, digits, unknown letters).
 * The key doubles as the Firestore document id.
 */
export function dictionaryKey(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length > 64) return null;
  const s = normalizeJawi(raw);
  const letters = Array.from(s);
  if (letters.length < DICT_LIMITS.minLength || letters.length > DICT_LIMITS.maxLength) return null;
  return letters.every((ch) => JAWI_LETTER_SET.has(ch)) ? s : null;
}

/**
 * The single gate for scoring: a word may be accepted automatically only when
 * an authoritative, allowed source said VALID and the evidence is recorded.
 */
export function isAcceptable(c: WordCheck): boolean {
  if (c.status !== 'VALID' || !c.source || !c.evidence) return false;
  const m = c.evidence.method;
  if (m === 'central-dictionary') return !!c.evidence.reviewedBy && !!c.source.name && !!c.source.version;
  return m === 'provider' || m === 'local';
}

export function messageFor(status: WordStatus, opts: { source?: DictionarySource; reason?: string; providerConfigured?: boolean } = {}): string {
  switch (status) {
    case 'VALID':
      return `Disahkan oleh ${opts.source?.name ?? 'sumber berautoriti'}${opts.source?.version ? ` (${opts.source.version})` : ''}.`;
    case 'INVALID':
      return `Tidak diterima${opts.source ? ` oleh ${opts.source.name}` : ''}${opts.reason ? `: ${opts.reason}` : ''}.`;
    case 'NOT_FOUND':
      return opts.providerConfigured === false
        ? 'Tidak ditemui dalam kamus lokal dan kamus pusat (belum ada penyedia kamus luar). Ini tidak bermaksud ejaan salah.'
        : 'Tidak ditemui dalam kamus yang disemak. Ini tidak bermaksud ejaan salah.';
    case 'PENDING_REVIEW':
      return 'Sedang menunggu semakan pentadbir.';
    case 'SERVICE_UNAVAILABLE':
      return 'Kamus online tidak dapat dihubungi. Jubin anda kekal di papan — cuba lagi.';
  }
}

// ---- callable function --------------------------------------------------------

export interface ValidateRequest {
  words: string[];
}

export interface ProviderInfo {
  id: string;
  name: string;
  version: string;
  licence?: string;
  configured: boolean;
}

export interface ValidateResponse {
  results: WordCheck[];
  provider: ProviderInfo;
}

// ---- Firestore documents --------------------------------------------------------

/** dictionary/{key}. Timestamps are Firestore Timestamps on the wire. */
export interface DictionaryDoc<T = unknown> {
  key: string;
  word: string;
  status: 'verified' | 'rejected';
  rumi?: string;
  meaningMs?: string;
  reason?: string;
  source: { id: string; name: string; version: string };
  evidence: { method: 'admin-review'; reviewedBy: string; reviewedAt: T; note: string };
  revision: number;
  createdAt: T;
  updatedAt: T;
}

export interface SuggestionDoc<T = unknown> {
  key: string;
  word: string;
  status: 'pending' | 'approved' | 'rejected';
  count: number;
  firstAt: T;
  lastAt: T;
  reviewedBy?: string;
  reviewedAt?: T;
}
