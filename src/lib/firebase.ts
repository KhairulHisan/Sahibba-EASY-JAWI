/**
 * Lazy Firebase client. The SDK is only downloaded when a feature that needs
 * it is used (Multiplayer, Smart Online Dictionary, admin page), so Single
 * Player stays small and fully offline.
 *
 * Capability flags
 *   FIREBASE_ENABLED         Auth + Firestore reachable (works on the free Spark plan)
 *   CLOUD_FUNCTIONS_ENABLED  Cloud Functions deployed (Blaze plan): `npm run build`
 *   MULTIPLAYER_ENABLED      both of the above
 */
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { PROJECT_FIREBASE_CONFIG } from './firebaseConfig';

const env = import.meta.env;
// Direct `import.meta.env.X` access so the build replaces it and drops emulator-only code.
export const MP_EMULATOR = import.meta.env.VITE_FIREBASE_EMULATOR === '1';

// Emulator builds always use the offline demo project, never the real one.
const config = MP_EMULATOR
  ? { apiKey: 'demo-key', authDomain: undefined, projectId: 'demo-easy-jawi', appId: 'demo-app' }
  : {
      apiKey: env.VITE_FIREBASE_API_KEY || PROJECT_FIREBASE_CONFIG.apiKey,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || PROJECT_FIREBASE_CONFIG.authDomain,
      projectId: env.VITE_FIREBASE_PROJECT_ID || PROJECT_FIREBASE_CONFIG.projectId,
      appId: env.VITE_FIREBASE_APP_ID || PROJECT_FIREBASE_CONFIG.appId,
    };

/** Firebase can be reached at all (not the offline single-file build). */
export const FIREBASE_ENABLED = env.VITE_EMBEDDED !== '1' && Boolean(config.projectId && config.apiKey);
/** Cloud Functions are deployed for this build's project (Blaze plan) or emulated. */
export const CLOUD_FUNCTIONS_ENABLED = FIREBASE_ENABLED && (MP_EMULATOR || (env.VITE_CLOUD_FUNCTIONS === '1' && env.MODE !== 'single'));
/** Multiplayer needs the authoritative game server (Cloud Functions). */
export const MULTIPLAYER_ENABLED = CLOUD_FUNCTIONS_ENABLED;
export const FUNCTIONS_REGION = 'asia-southeast1';

export interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  fns: Functions;
  /** Current user's uid (anonymous player, or a signed-in admin). */
  readonly uid: string;
  fs: typeof import('firebase/firestore');
  fn: typeof import('firebase/functions');
  authMod: typeof import('firebase/auth');
}

let ready: Promise<FirebaseHandles> | null = null;

export function firebase(): Promise<FirebaseHandles> {
  if (!FIREBASE_ENABLED) return Promise.reject(new Error('Firebase tidak dikonfigurasi dalam binaan ini.'));
  ready ??= (async () => {
    const [{ initializeApp }, authMod, fs, fn] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
      import('firebase/functions'),
    ]);
    const app = initializeApp(config);
    // App Check (optional): proves requests come from this web app. Needs a
    // reCAPTCHA Enterprise site key registered in the Firebase console.
    if (!MP_EMULATOR && env.VITE_APPCHECK_SITE_KEY) {
      const ac = await import('firebase/app-check');
      ac.initializeAppCheck(app, { provider: new ac.ReCaptchaEnterpriseProvider(env.VITE_APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
    }
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
    if (!auth.currentUser) await authMod.signInAnonymously(auth);
    return {
      app,
      auth,
      db,
      fns,
      get uid() {
        return auth.currentUser?.uid ?? '';
      },
      fs,
      fn,
      authMod,
    };
  })();
  ready.catch(() => (ready = null));
  return ready;
}
