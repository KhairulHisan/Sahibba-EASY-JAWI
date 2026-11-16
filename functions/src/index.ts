/**
 * EASY JAWI multiplayer — Cloud Functions entry point (2nd gen).
 * Thin wrappers: authenticate, then delegate to the pure room logic in
 * rooms.ts inside a Firestore transaction. Region: asia-southeast1.
 */
import { randomBytes, randomInt } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';
import type { RandomSource, Repo, Tx } from './repo';
import * as rooms from './rooms';

setGlobalOptions({ region: 'asia-southeast1', maxInstances: 10 });
initializeApp();
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

class FirestoreRepo implements Repo {
  constructor(private readonly fs: Firestore) {}

  run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.fs.runTransaction(async (t) =>
      fn({
        get: async <U>(path: string) => {
          const snap = await t.get(this.fs.doc(path));
          return snap.exists ? (snap.data() as U) : null;
        },
        set: (path, data) => {
          t.set(this.fs.doc(path), data as FirebaseFirestore.DocumentData);
        },
        delete: (path) => {
          t.delete(this.fs.doc(path));
        },
      }),
    );
  }

  async findExpiredRoomIds(now: number, limit: number): Promise<string[]> {
    const snap = await this.fs.collection('rooms').where('status', 'in', ['menunggu', 'sedia', 'bermain']).where('expiresAt', '<', now).limit(limit).get();
    return snap.docs.map((d) => d.id);
  }
}

const repo = new FirestoreRepo(db);

/** Server CSPRNG for shuffles, turn order and room ids. */
const random: RandomSource = {
  int: (max) => randomInt(max),
  id: () => randomBytes(15).toString('base64url'),
};

type Handler<R> = (ctx: rooms.Ctx, input: unknown) => Promise<R>;

function callable<R>(handler: Handler<R>) {
  return onCall({ cors: true }, async (req: CallableRequest<unknown>) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sila log masuk semula.');
    try {
      return await handler({ repo, uid, now: Date.now(), random }, req.data);
    } catch (e) {
      if (e instanceof rooms.RoomError) throw new HttpsError(e.status, e.message, { reason: e.reason, ...(e.detail ?? {}) });
      console.error(e);
      throw new HttpsError('internal', 'Ralat pelayan. Sila cuba lagi.');
    }
  });
}

export const createRoom = callable(rooms.createRoom);
export const joinRoom = callable(rooms.joinRoom);
export const approveJoin = callable(rooms.approveJoin);
export const setReady = callable(rooms.setReady);
export const updateSettings = callable(rooms.updateSettings);
export const startGame = callable(rooms.startGame);
export const gameAction = callable(rooms.act);
export const claimTimeout = callable(rooms.claimTimeout);
export const heartbeat = callable(rooms.heartbeat);
export const leaveRoom = callable(rooms.leaveRoom);

export const closeExpiredRooms = onSchedule('every 30 minutes', async () => {
  const n = await rooms.expireRooms(repo, Date.now());
  console.log(`closeExpiredRooms: ${n} bilik ditutup`);
});
