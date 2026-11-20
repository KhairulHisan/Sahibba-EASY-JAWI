/**
 * Deterministic, seedable PRNG (mulberry32). The full generator state is a
 * single uint32 so it can be persisted inside GameState and resumed exactly.
 *
 * Live games seed it from `secureSeed()` (Web Crypto). Unit tests pass fixed
 * seeds. The multiplayer server must use its own CSPRNG-backed shuffle; this
 * generator is NOT cryptographically secure.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  get state(): number {
    return this.s;
  }

  /** Float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, max). */
  int(max: number): number {
    return Math.floor(this.next() * max);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick() from empty array');
    return items[this.int(items.length)] as T;
  }

  /** In-place Fisher–Yates shuffle. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }
}

/** 32-bit seed from the platform CSPRNG (browser + Node ≥ 19). */
export function secureSeed(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0]!;
}

/** Short random id suitable for idempotency keys / game ids. */
export function randomId(prefix = ''): string {
  const buf = new Uint8Array(9);
  globalThis.crypto.getRandomValues(buf);
  return prefix + Array.from(buf, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
}
