/** Security rules for the Smart Online Dictionary, against the Firestore emulator. */
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const ANON = { firebase: { sign_in_provider: 'anonymous' } };
const GOOGLE = { firebase: { sign_in_provider: 'google.com' } };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-easy-jawi',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins/cikgu'), { role: 'admin' });
    await setDoc(doc(db, 'admins/anonAdmin'), { role: 'admin' });
    await setDoc(doc(db, 'dictionary/بوکو'), { key: 'بوکو', word: 'بوکو', status: 'verified', revision: 1 });
    await setDoc(doc(db, 'dictionaryCache/p__بوکو'), { status: 'VALID' });
    await setDoc(doc(db, 'dictRateLimits/ali'), { count: 1 });
  });
});

const player = (uid: string) => env.authenticatedContext(uid, ANON).firestore();
const admin = () => env.authenticatedContext('cikgu', GOOGLE).firestore();
const nobody = () => env.unauthenticatedContext().firestore();

function entry(key: string, reviewer: string, extra: Record<string, unknown> = {}) {
  return {
    key,
    word: key,
    status: 'verified',
    rumi: 'ujian',
    source: { id: 'kamus-pusat', name: 'Kamus Dewan Edisi Keempat', version: 'Ed. 4' },
    evidence: { method: 'admin-review', reviewedBy: reviewer, reviewedAt: serverTimestamp(), note: 'hlm. 123' },
    revision: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...extra,
  };
}

/** The exact write the app performs for a first suggestion (see suggestWord). */
function suggest(db: Firestore, uid: string, key: string, opts: { exists?: boolean; quota?: 'new' | { count: number; windowStart: unknown } | 'skip'; skipMine?: boolean; countBy?: number } = {}) {
  const b = writeBatch(db);
  const ts = serverTimestamp();
  if (opts.quota !== 'skip') {
    const q = opts.quota && opts.quota !== 'new' ? { count: opts.quota.count + 1, windowStart: opts.quota.windowStart, lastAt: ts } : { count: 1, windowStart: ts, lastAt: ts };
    b.set(doc(db, 'suggestQuota', uid), q);
  }
  if (opts.exists) b.update(doc(db, 'wordSuggestions', key), { count: increment(opts.countBy ?? 1), lastAt: ts });
  else b.set(doc(db, 'wordSuggestions', key), { key, word: key, status: 'pending', count: 1, firstAt: ts, lastAt: ts });
  if (!opts.skipMine) b.set(doc(db, 'wordSuggestions', key, 'by', uid), { at: ts, words: ['سب'] });
  return b.commit();
}

describe('dictionary rules', () => {
  it('central dictionary: signed-in players can look a word up; not list it; never write it', async () => {
    await assertSucceeds(getDoc(doc(player('ali'), 'dictionary/بوکو')));
    await assertFails(getDoc(doc(nobody(), 'dictionary/بوکو')));
    await assertFails(getDocs(collection(player('ali'), 'dictionary')));
    await assertFails(setDoc(doc(player('ali'), 'dictionary/سب'), entry('سب', 'ali')));
    await assertFails(updateDoc(doc(player('ali'), 'dictionary/بوکو'), { status: 'rejected' }));
  });

  it('an anonymous account is never an admin, even if listed', async () => {
    const anonAdmin = env.authenticatedContext('anonAdmin', ANON).firestore();
    await assertFails(setDoc(doc(anonAdmin, 'dictionary/سب'), entry('سب', 'anonAdmin')));
    await assertFails(getDocs(collection(anonAdmin, 'wordSuggestions')));
  });

  it('admins write complete, attributed entries only', async () => {
    const db = admin();
    await assertSucceeds(getDocs(collection(db, 'dictionary')));
    await assertFails(setDoc(doc(db, 'dictionary/سب'), entry('سب', 'someone-else'))); // reviewer must be you
    await assertFails(setDoc(doc(db, 'dictionary/سب'), entry('سب', 'cikgu', { evidence: { method: 'admin-review', reviewedBy: 'cikgu', reviewedAt: serverTimestamp(), note: '' } }))); // no evidence note
    await assertFails(setDoc(doc(db, 'dictionary/سب'), entry('سب', 'cikgu', { source: { id: 'kamus-pusat', name: 'KD', version: '' } }))); // no version
    await assertFails(setDoc(doc(db, 'dictionary/سب'), entry('سب', 'cikgu', { status: 'maybe' })));
    await assertFails(setDoc(doc(db, 'dictionary/سب'), entry('سب', 'cikgu', { status: 'rejected' }))); // rejection needs a reason
    await assertFails(setDoc(doc(db, 'dictionary/سب'), entry('سب', 'cikgu', { revision: 5 })));
    await assertFails(setDoc(doc(db, 'dictionary/سس'), entry('سب', 'cikgu'))); // id must equal key
    await assertSucceeds(setDoc(doc(db, 'dictionary/سب'), entry('سب', 'cikgu')));
    const created = (await getDoc(doc(db, 'dictionary/سب'))).data()!;
    await assertFails(setDoc(doc(db, 'dictionary/سب'), entry('سب', 'cikgu', { createdAt: created.createdAt }))); // revision must go up
    await assertSucceeds(setDoc(doc(db, 'dictionary/سب'), entry('سب', 'cikgu', { status: 'rejected', reason: 'ejaan-salah', revision: 2, createdAt: created.createdAt })));
    await assertFails(deleteDoc(doc(db, 'dictionary/سب')));
  });

  it('admin list membership: only your own entry is readable, nobody can write it', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'admins/cikgu')));
    await assertSucceeds(getDoc(doc(player('ali'), 'admins/ali')));
    await assertFails(getDoc(doc(player('ali'), 'admins/cikgu')));
    await assertFails(setDoc(doc(player('ali'), 'admins/ali'), { role: 'admin' }));
    await assertFails(setDoc(doc(admin(), 'admins/ali'), { role: 'admin' }));
  });

  it('audit log: admins append attributed records; nobody edits them', async () => {
    const rec = (by: string) => ({ key: 'سب', action: 'approve', status: 'verified', by, at: serverTimestamp(), note: 'hlm. 1', source: 'KD Ed. 4', revision: 1 });
    await assertFails(setDoc(doc(player('ali'), 'dictionaryAudit/a1'), rec('ali')));
    await assertFails(setDoc(doc(admin(), 'dictionaryAudit/a1'), rec('ali')));
    await assertSucceeds(setDoc(doc(admin(), 'dictionaryAudit/a1'), rec('cikgu')));
    await assertFails(updateDoc(doc(admin(), 'dictionaryAudit/a1'), { note: 'ubah' }));
    await assertFails(getDocs(collection(player('ali'), 'dictionaryAudit')));
  });

  it('server-only collections are closed to clients', async () => {
    await assertFails(getDoc(doc(player('ali'), 'dictionaryCache/p__بوکو')));
    await assertFails(getDoc(doc(player('ali'), 'dictRateLimits/ali')));
    await assertFails(getDoc(doc(admin(), 'dictionaryCache/p__بوکو')));
  });
});

describe('suggestion rules', () => {
  it('a player suggests a word once; others add to the count; nobody can inflate it', async () => {
    await assertSucceeds(suggest(player('ali'), 'ali', 'سب'));
    // Same player again (even after the gap): refused.
    await assertFails(suggest(player('ali'), 'ali', 'سب', { exists: true, quota: 'skip' }));
    // Another player: count + 1.
    await assertSucceeds(suggest(player('siti'), 'siti', 'سب', { exists: true }));
    // Count + 2, or without the player's own record, or without the quota counter: refused.
    await assertFails(suggest(player('abu'), 'abu', 'سب', { exists: true, countBy: 2 }));
    await assertFails(suggest(player('abu'), 'abu', 'سب', { exists: true, skipMine: true }));
    await assertFails(suggest(player('abu'), 'abu', 'سب', { exists: true, quota: 'skip' }));
    const s = (await getDoc(doc(player('abu'), 'wordSuggestions/سب'))).data()!;
    if (s.count !== 2 || s.status !== 'pending') throw new Error(`unexpected ${JSON.stringify(s)}`);
  });

  it('players cannot approve, list or read others\' suggestions; admins can', async () => {
    await suggest(player('ali'), 'ali', 'سب');
    await assertFails(updateDoc(doc(player('ali'), 'wordSuggestions/سب'), { status: 'approved' }));
    await assertFails(getDocs(collection(player('ali'), 'wordSuggestions')));
    await assertSucceeds(getDoc(doc(player('ali'), 'wordSuggestions/سب/by/ali')));
    await assertFails(getDoc(doc(player('siti'), 'wordSuggestions/سب/by/ali')));
    await assertSucceeds(getDocs(query(collection(admin(), 'wordSuggestions'), where('status', '==', 'pending'))));
    await assertSucceeds(getDocs(collection(admin(), 'wordSuggestions/سب/by')));
    await assertSucceeds(updateDoc(doc(admin(), 'wordSuggestions/سب'), { status: 'approved', reviewedBy: 'cikgu', reviewedAt: serverTimestamp() }));
    // Reviewed: no more player bumps.
    await assertFails(suggest(player('siti'), 'siti', 'سب', { exists: true }));
  });

  it('rate limit: a second suggestion within 5 s is refused; quotas are per player', async () => {
    await assertSucceeds(suggest(player('ali'), 'ali', 'سب'));
    const q = (await getDoc(doc(player('ali'), 'suggestQuota/ali'))).data()!;
    await assertFails(suggest(player('ali'), 'ali', 'سس', { quota: { count: q.count, windowStart: q.windowStart } }));
    await assertFails(getDoc(doc(player('siti'), 'suggestQuota/ali')));
    await assertFails(setDoc(doc(player('siti'), 'suggestQuota/ali'), { count: 1, windowStart: serverTimestamp(), lastAt: serverTimestamp() }));
  });

  it('a suggestion cannot carry extra fields or a bad key', async () => {
    const db = player('ali');
    const b = writeBatch(db);
    const ts = serverTimestamp();
    b.set(doc(db, 'suggestQuota', 'ali'), { count: 1, windowStart: ts, lastAt: ts });
    b.set(doc(db, 'wordSuggestions', 'سب'), { key: 'سب', word: 'سب', status: 'approved', count: 1, firstAt: ts, lastAt: ts });
    b.set(doc(db, 'wordSuggestions', 'سب', 'by', 'ali'), { at: ts, words: [] });
    await assertFails(b.commit());
  });
});
