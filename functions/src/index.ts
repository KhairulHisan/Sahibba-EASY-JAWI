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
import { defineSecret } from 'firebase-functions/params';
import { HttpJsonProvider, NO_PROVIDER, misconfiguredProvider, validateWordsOnline, type DictionaryProvider } from './dictionary';
import { emulatorFakeProvider } from './emulatorFakeProvider';
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

function callable<R>(handler: Handler<R>, options: { enforceAppCheck?: boolean; secrets?: ReturnType<typeof defineSecret>[]; timeoutSeconds?: number } = {}) {
  return onCall({ cors: true, ...options }, async (req: CallableRequest<unknown>) => {
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

// ---------------------------------------------------------------------------
// Smart Online Jawi Dictionary (Single Player)
// ---------------------------------------------------------------------------

/**
 * Provider selection, from functions/.env.<project> (read at deploy and at start):
 *   DICT_PROVIDER=none (default)   no external provider; central dictionary only
 *   DICT_PROVIDER=http             licensed provider via HttpJsonProvider; also needs
 *                                  DICT_PROVIDER_URL (https), _ID, _NAME, _VERSION, [_LICENCE]
 *                                  and the secret DICT_PROVIDER_API_KEY in Secret Manager
 *   DICT_PROVIDER=emulator-fake    test fixture, refused outside the emulator
 * ENFORCE_APP_CHECK=true           reject calls without a valid App Check token.
 */
function selectProvider(): { provider: DictionaryProvider; secrets: ReturnType<typeof defineSecret>[] } {
  const env = process.env;
  const kind = env.DICT_PROVIDER ?? 'none';
  if (kind === 'none') return { provider: NO_PROVIDER, secrets: [] };
  if (kind === 'emulator-fake') {
    return { provider: env.FUNCTIONS_EMULATOR === 'true' ? emulatorFakeProvider : misconfiguredProvider('emulator-fake is test-only'), secrets: [] };
  }
  if (kind === 'http') {
    const missing = ['DICT_PROVIDER_URL', 'DICT_PROVIDER_ID', 'DICT_PROVIDER_NAME', 'DICT_PROVIDER_VERSION'].filter((k) => !env[k]);
    if (missing.length) return { provider: misconfiguredProvider(`missing ${missing.join(', ')}`), secrets: [] };
    if (!env.DICT_PROVIDER_URL!.startsWith('https://')) return { provider: misconfiguredProvider('URL must be https'), secrets: [] };
    if (!/^[a-z0-9-]{2,40}$/.test(env.DICT_PROVIDER_ID!)) return { provider: misconfiguredProvider('ID must be [a-z0-9-]'), secrets: [] };
    const apiKey = defineSecret('DICT_PROVIDER_API_KEY');
    return {
      provider: new HttpJsonProvider({
        id: env.DICT_PROVIDER_ID!,
        name: env.DICT_PROVIDER_NAME!,
        version: env.DICT_PROVIDER_VERSION!,
        licence: env.DICT_PROVIDER_LICENCE,
        url: env.DICT_PROVIDER_URL!,
        apiKey: () => apiKey.value(),
      }),
      secrets: [apiKey],
    };
  }
  return { provider: misconfiguredProvider(`unknown DICT_PROVIDER "${kind}"`), secrets: [] };
}

const dictionaryProvider = selectProvider();

export const validateJawiWordOnline = callable(
  (ctx, input) => validateWordsOnline({ repo: ctx.repo, uid: ctx.uid, now: ctx.now, provider: dictionaryProvider.provider }, input),
  { enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true', secrets: dictionaryProvider.secrets, timeoutSeconds: 20 },
);
