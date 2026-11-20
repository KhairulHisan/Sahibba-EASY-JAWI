/**
 * Admin side of the Smart Online Dictionary. Writes go straight to Firestore;
 * firestore.rules only accept them from a non-anonymous account listed in
 * admins/{uid}, and only with source, version, reviewer, time and evidence.
 */
import type { Timestamp } from 'firebase/firestore';
import { CENTRAL_SOURCE_ID, type DictionaryDoc, type RejectReason, type SuggestionDoc } from '../../dictionary/protocol';
import { firebase } from '../../lib/firebase';

export interface AdminStatus {
  uid: string;
  email: string | null;
  anonymous: boolean;
  isAdmin: boolean;
}

export type Suggestion = SuggestionDoc<Timestamp>;
export type Entry = DictionaryDoc<Timestamp>;

export async function adminStatus(): Promise<AdminStatus> {
  const { auth, db, fs } = await firebase();
  const u = auth.currentUser;
  if (!u) return { uid: '', email: null, anonymous: true, isAdmin: false };
  if (u.isAnonymous) return { uid: u.uid, email: null, anonymous: true, isAdmin: false };
  let isAdmin = false;
  try {
    isAdmin = (await fs.getDoc(fs.doc(db, 'admins', u.uid))).exists();
  } catch {
    isAdmin = false;
  }
  return { uid: u.uid, email: u.email, anonymous: false, isAdmin };
}

export async function signInAdmin(): Promise<void> {
  const { auth, authMod } = await firebase();
  if (import.meta.env.VITE_FIREBASE_EMULATOR === '1') {
    // Emulator builds only (removed from production bundles): the Auth emulator
    // accepts an unsigned Google credential, so tests need no popup or Google scripts.
    const fake = JSON.stringify({ sub: 'pentadbir-ujian', email: 'pentadbir@contoh.test', email_verified: true });
    await authMod.signInWithCredential(auth, authMod.GoogleAuthProvider.credential(fake));
    return;
  }
  try {
    await authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider());
  } catch (e) {
    // Phones/in-app browsers often block popups: fall back to a full-page redirect.
    const code = (e as { code?: string }).code;
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await authMod.signInWithRedirect(auth, new authMod.GoogleAuthProvider());
      return;
    }
    throw e;
  }
}

/** Back to an anonymous player session (a reload re-initialises everything cleanly). */
export async function signOutAdmin(): Promise<void> {
  const { auth, authMod } = await firebase();
  await authMod.signOut(auth);
  window.location.reload();
}

export async function listPending(): Promise<Suggestion[]> {
  const { db, fs } = await firebase();
  const q = fs.query(fs.collection(db, 'wordSuggestions'), fs.where('status', '==', 'pending'), fs.orderBy('count', 'desc'), fs.limit(100));
  return (await fs.getDocs(q)).docs.map((d) => d.data() as Suggestion);
}

/** Other words formed in the same moves (helps the reviewer see how it was used). */
export async function listContexts(key: string): Promise<string[][]> {
  const { db, fs } = await firebase();
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'wordSuggestions', key, 'by'), fs.limit(5)));
  return snap.docs.map((d) => ((d.data() as { words?: string[] }).words ?? []).filter((w) => w !== key));
}

export async function listEntries(): Promise<Entry[]> {
  const { db, fs } = await firebase();
  const q = fs.query(fs.collection(db, 'dictionary'), fs.orderBy('updatedAt', 'desc'), fs.limit(60));
  return (await fs.getDocs(q)).docs.map((d) => d.data() as Entry);
}

export interface Decision {
  key: string;
  status: 'verified' | 'rejected';
  sourceName: string;
  sourceVersion: string;
  note: string;
  rumi?: string;
  meaningMs?: string;
  reason?: RejectReason;
}

/**
 * Record an admin decision atomically: the dictionary entry (new revision),
 * the suggestion's review status (if any) and an audit record.
 */
export async function decide(d: Decision): Promise<void> {
  const { db, fs, uid } = await firebase();
  const entryRef = fs.doc(db, 'dictionary', d.key);
  const sugRef = fs.doc(db, 'wordSuggestions', d.key);
  const auditRef = fs.doc(fs.collection(db, 'dictionaryAudit'));
  await fs.runTransaction(db, async (tx) => {
    const prev = await tx.get(entryRef);
    const sug = await tx.get(sugRef);
    const ts = fs.serverTimestamp();
    const old = prev.exists() ? (prev.data() as Entry) : null;
    const revision = (old?.revision ?? 0) + 1;
    const entry: Record<string, unknown> = {
      key: d.key,
      word: d.key,
      status: d.status,
      source: { id: CENTRAL_SOURCE_ID, name: d.sourceName.trim(), version: d.sourceVersion.trim() },
      evidence: { method: 'admin-review', reviewedBy: uid, reviewedAt: ts, note: d.note.trim() },
      revision,
      createdAt: old ? old.createdAt : ts,
      updatedAt: ts,
    };
    if (d.rumi?.trim()) entry.rumi = d.rumi.trim().toLowerCase();
    if (d.meaningMs?.trim()) entry.meaningMs = d.meaningMs.trim();
    if (d.status === 'rejected') entry.reason = d.reason ?? 'lain';
    tx.set(entryRef, entry);
    if (sug.exists()) {
      const want = d.status === 'verified' ? 'approved' : 'rejected';
      if ((sug.data() as Suggestion).status !== want) tx.update(sugRef, { status: want, reviewedBy: uid, reviewedAt: ts });
    }
    tx.set(auditRef, {
      key: d.key,
      action: !old ? (sug.exists() ? (d.status === 'verified' ? 'approve' : 'reject') : 'add') : 'change',
      status: d.status,
      by: uid,
      at: ts,
      note: d.note.trim(),
      source: `${d.sourceName.trim()} (${d.sourceVersion.trim()})`,
      revision,
    });
  });
}
