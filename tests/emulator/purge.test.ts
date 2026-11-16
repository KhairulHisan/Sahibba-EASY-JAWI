/**
 * The Firestore-backed repo against the emulator (Admin SDK): closed rooms
 * are found by the composite query and deleted with every subcollection.
 */
import { createRequire } from 'node:module';
import { afterAll, describe, expect, it } from 'vitest';
import { FirestoreRepo } from '../../functions/src/firestoreRepo';

// firebase-admin is a dependency of functions/, not of the web app.
const requireFromFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { deleteApp, initializeApp } = requireFromFunctions('firebase-admin/app') as typeof import('firebase-admin/app');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore') as typeof import('firebase-admin/firestore');

const app = initializeApp({ projectId: 'demo-easy-jawi' }, 'purge-test');
const db = getFirestore(app);
const repo = new FirestoreRepo(db);

afterAll(async () => {
  await deleteApp(app);
});

describe('FirestoreRepo purge', () => {
  it('deletes a closed room with its racks, move log and server state, and leaves active rooms alone', async () => {
    const now = Date.now();
    await db.doc('rooms/purge-old').set({ status: 'tamat', expiresAt: now - 1000, code: '5555' });
    await db.doc('rooms/purge-old/hands/u1').set({ rack: [], version: 3 });
    await db.doc('rooms/purge-old/moves/0000').set({ type: 'pass' });
    await db.doc('serverState/purge-old').set({ state: null });
    await db.doc('rooms/purge-active').set({ status: 'bermain', expiresAt: now - 1000, code: '5556' });

    const ids = await repo.findPurgeableRoomIds(now, 100);
    expect(ids).toContain('purge-old');
    expect(ids).not.toContain('purge-active');
    expect(await repo.findExpiredRoomIds(now, 100)).toContain('purge-active');

    await repo.purgeRoom('purge-old');
    for (const path of ['rooms/purge-old', 'rooms/purge-old/hands/u1', 'rooms/purge-old/moves/0000', 'serverState/purge-old']) {
      expect((await db.doc(path).get()).exists).toBe(false);
    }
    expect((await db.doc('rooms/purge-active').get()).exists).toBe(true);
  });
});
