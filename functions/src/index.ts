/**
 * EASY JAWI multiplayer — Cloud Functions entry point (2nd gen).
 * Thin wrappers: authenticate, then delegate to the pure room logic in
 * rooms.ts inside a Firestore transaction. Region: asia-southeast1.
 */
import { randomBytes, randomInt } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';
import { FirestoreRepo } from './firestoreRepo';
import type { RandomSource } from './repo';
import * as rooms from './rooms';

setGlobalOptions({ region: 'asia-southeast1', maxInstances: 10 });
initializeApp();
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

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

/** Close idle rooms, and delete closed rooms (nicknames, racks, move logs) once they are old. */
export const closeExpiredRooms = onSchedule('every 30 minutes', async () => {
  const now = Date.now();
  const closed = await rooms.expireRooms(repo, now);
  const purged = await rooms.purgeOldRooms(repo, now);
  console.log(`closeExpiredRooms: ${closed} bilik ditutup, ${purged} bilik lama dipadam`);
});
