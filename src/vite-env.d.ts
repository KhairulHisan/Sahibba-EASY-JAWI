/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_EMBEDDED: '0' | '1';
}
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** "1" = use the local Firebase Emulator Suite. */
  readonly VITE_FIREBASE_EMULATOR?: string;
  readonly VITE_FIREBASE_EMULATOR_HOST?: string;
  /** "1" = this build's project has Cloud Functions deployed (Blaze plan). */
  readonly VITE_CLOUD_FUNCTIONS?: string;
  /** reCAPTCHA Enterprise site key for Firebase App Check (optional). */
  readonly VITE_APPCHECK_SITE_KEY?: string;
}
