/**
 * Lazy Firebase client. The SDK is only downloaded when a player opens
 * multiplayer, so single player stays small and fully offline.
 */
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';

const env = import.meta.env;
export const MP_EMULATOR = env.VITE_FIREBASE_EMULATOR === '1';
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || (MP_EMULATOR ? 'demo-key' : ''),
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID || (MP_EMULATOR ? 'demo-easy-jawi' : ''),
  appId: env.VITE_FIREBASE_APP_ID || (MP_EMULATOR ? 'demo-app' : ''),
};

/** True when this build can reach a multiplayer server (real project or emulator). */
export const MULTIPLAYER_ENABLED = env.VITE_EMBEDDED !== '1' && Boolean(config.projectId && config.apiKey);
export const FUNCTIONS_REGION = 'asia-southeast1';

export interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  fns: Functions;
  uid: string;
  fs: typeof import('firebase/firestore');
  fn: typeof import('firebase/functions');
}

let ready: Promise<FirebaseHandles> | null = null;

export function firebase(): Promise<FirebaseHandles> {
  if (!MULTIPLAYER_ENABLED) return Promise.reject(new Error('Multiplayer belum dikonfigurasi.'));
  ready ??= (async () => {
    const [{ initializeApp }, authMod, fs, fn] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
      import('firebase/functions'),
    ]);
    const app = initializeApp(config);
    const auth = authMod.getAuth(app);
    const db = fs.initializeFirestore(app, { localCache: fs.memoryLocalCache() });
    const fns = fn.getFunctions(app, FUNCTIONS_REGION);
    if (MP_EMULATOR) {
      const host = env.VITE_FIREBASE_EMULATOR_HOST || window.location.hostname || '127.0.0.1';
      authMod.connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
      fs.connectFirestoreEmulator(db, host, 8080);
      fn.connectFunctionsEmulator(fns, host, 5001);
    }
    // Anonymous sign-in: no personal data. The same uid survives a page refresh.
    await auth.authStateReady();
    const user = auth.currentUser ?? (await authMod.signInAnonymously(auth)).user;
    return { app, auth, db, fns, uid: user.uid, fs, fn };
  })();
  ready.catch(() => (ready = null));
  return ready;
}
