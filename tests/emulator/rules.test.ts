import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-easy-jawi',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'rooms/r1'), { code: '0427', readerUids: ['alice', 'bob', 'pendingCarol'], status: 'bermain' });
    await setDoc(doc(db, 'rooms/r1/hands/alice'), { rack: [{ id: 't1', letter: 'ب' }] });
    await setDoc(doc(db, 'rooms/r1/hands/bob'), { rack: [{ id: 't2', letter: 'س' }] });
    await setDoc(doc(db, 'rooms/r1/moves/0000'), { uid: 'alice', score: 10 });
    await setDoc(doc(db, 'serverState/r1'), { state: { bag: [] } });
    await setDoc(doc(db, 'roomCodes/0427'), { roomId: 'r1' });
    await setDoc(doc(db, 'rateLimits/alice'), { join: { count: 1 } });
  });
});

afterAll(async () => {
  await env?.cleanup();
});

const as = (uid: string | null) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());

describe('firestore.rules', () => {
  it('room: members and pending requests can read; outsiders and anonymous visitors cannot', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'rooms/r1')));
    await assertSucceeds(getDoc(doc(as('pendingCarol'), 'rooms/r1')));
    await assertFails(getDoc(doc(as('mallory'), 'rooms/r1')));
    await assertFails(getDoc(doc(as(null), 'rooms/r1')));
  });

  it('rooms cannot be listed (no public room browsing)', async () => {
    await assertFails(getDocs(collection(as('alice'), 'rooms')));
  });

  it('a rack is readable only by its owner', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'rooms/r1/hands/alice')));
    await assertFails(getDoc(doc(as('bob'), 'rooms/r1/hands/alice')));
    await assertFails(getDoc(doc(as('mallory'), 'rooms/r1/hands/alice')));
    await assertFails(getDocs(collection(as('alice'), 'rooms/r1/hands')));
  });

  it('move log: members only', async () => {
    await assertSucceeds(getDocs(collection(as('bob'), 'rooms/r1/moves')));
    await assertFails(getDocs(collection(as('mallory'), 'rooms/r1/moves')));
  });

  it('server state, room codes and rate limits are never readable by clients', async () => {
    for (const path of ['serverState/r1', 'roomCodes/0427', 'rateLimits/alice']) {
      await assertFails(getDoc(doc(as('alice'), path)));
    }
  });

  it('clients cannot write anything (scores, turns, racks, bag)', async () => {
    const db = as('alice');
    await assertFails(updateDoc(doc(db, 'rooms/r1'), { status: 'tamat' }));
    await assertFails(setDoc(doc(db, 'rooms/r2'), { readerUids: ['alice'] }));
    await assertFails(setDoc(doc(db, 'rooms/r1/hands/alice'), { rack: [] }));
    await assertFails(setDoc(doc(db, 'rooms/r1/moves/0001'), { score: 999 }));
    await assertFails(setDoc(doc(db, 'serverState/r1'), { state: null }));
    await assertFails(setDoc(doc(db, 'roomCodes/9999'), { roomId: 'r1' }));
    await assertFails(deleteDoc(doc(db, 'rooms/r1')));
  });
});
