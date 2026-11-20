/**
 * Minimal transactional document store used by the room logic. Firestore and
 * an in-memory implementation (tests, local tooling) share this interface.
 * Rule enforced by both: inside a transaction, every read happens before the
 * first write (a Firestore requirement).
 */
export interface Tx {
  get<T>(path: string): Promise<T | null>;
  set<T>(path: string, data: T): void;
  delete(path: string): void;
}

export interface Repo {
  run<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Room ids whose expiresAt is in the past and status is still active. */
  findExpiredRoomIds(now: number, limit: number): Promise<string[]>;
  /** Finished or expired rooms whose expiresAt is before `before`. */
  findPurgeableRoomIds(before: number, limit: number): Promise<string[]>;
  /** Delete a room for good: room, racks, move log and server state. */
  purgeRoom(roomId: string): Promise<void>;
}

export const ACTIVE_STATUSES = ['menunggu', 'sedia', 'bermain'] as const;
export const CLOSED_STATUSES = ['tamat', 'tamat-tempoh'] as const;

export interface RandomSource {
  /** Uniform integer in [0, max). Must be cryptographically strong in production. */
  int(max: number): number;
  /** Unguessable identifier. */
  id(): string;
}

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

export class MemoryRepo implements Repo {
  readonly docs = new Map<string, unknown>();
  private queue: Promise<unknown> = Promise.resolve();

  /** Transactions are serialised, like Firestore's optimistic retries would effectively order them. */
  run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      const writes = new Map<string, unknown | typeof DELETE>();
      let wrote = false;
      const tx: Tx = {
        get: async <U>(path: string) => {
          if (wrote) throw new Error(`Transaction read after write: ${path}`);
          return (this.docs.has(path) ? clone(this.docs.get(path)) : null) as U | null;
        },
        set: (path, data) => {
          wrote = true;
          writes.set(path, clone(data));
        },
        delete: (path) => {
          wrote = true;
          writes.set(path, DELETE);
        },
      };
      const value = await fn(tx);
      for (const [path, data] of writes) {
        if (data === DELETE) this.docs.delete(path);
        else this.docs.set(path, data);
      }
      return value;
    });
    this.queue = result.catch(() => undefined);
    return result;
  }

  private roomsWhere(statuses: readonly string[], before: number, limit: number): string[] {
    const out: string[] = [];
    for (const [path, doc] of this.docs) {
      const m = /^rooms\/([^/]+)$/.exec(path);
      const room = doc as { expiresAt?: number; status?: string };
      if (m && room.expiresAt !== undefined && room.expiresAt < before && statuses.includes(room.status ?? '')) out.push(m[1]!);
      if (out.length >= limit) break;
    }
    return out;
  }

  async findExpiredRoomIds(now: number, limit: number): Promise<string[]> {
    return this.roomsWhere(ACTIVE_STATUSES, now, limit);
  }

  async findPurgeableRoomIds(before: number, limit: number): Promise<string[]> {
    return this.roomsWhere(CLOSED_STATUSES, before, limit);
  }

  async purgeRoom(roomId: string): Promise<void> {
    for (const path of [...this.docs.keys()]) {
      if (path === `rooms/${roomId}` || path.startsWith(`rooms/${roomId}/`) || path === `serverState/${roomId}`) this.docs.delete(path);
    }
  }
}

const DELETE = Symbol('delete');
