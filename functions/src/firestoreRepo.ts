import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { ACTIVE_STATUSES, CLOSED_STATUSES, type Repo, type Tx } from './repo';

/** Repo backed by Firestore (Admin SDK). */
export class FirestoreRepo implements Repo {
  constructor(private readonly fs: Firestore) {}

  run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.fs.runTransaction(async (t) =>
      fn({
        get: async <U>(path: string) => {
          const snap = await t.get(this.fs.doc(path));
          return snap.exists ? (snap.data() as U) : null;
        },
        set: (path, data) => {
          t.set(this.fs.doc(path), data as DocumentData);
        },
        delete: (path) => {
          t.delete(this.fs.doc(path));
        },
      }),
    );
  }

  private async roomsWhere(statuses: readonly string[], before: number, limit: number): Promise<string[]> {
    const snap = await this.fs.collection('rooms').where('status', 'in', [...statuses]).where('expiresAt', '<', before).limit(limit).get();
    return snap.docs.map((d) => d.id);
  }

  findExpiredRoomIds(now: number, limit: number): Promise<string[]> {
    return this.roomsWhere(ACTIVE_STATUSES, now, limit);
  }

  findPurgeableRoomIds(before: number, limit: number): Promise<string[]> {
    return this.roomsWhere(CLOSED_STATUSES, before, limit);
  }

  async purgeRoom(roomId: string): Promise<void> {
    await this.fs.recursiveDelete(this.fs.doc(`rooms/${roomId}`));
    await this.fs.doc(`serverState/${roomId}`).delete();
  }
}
