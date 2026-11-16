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
}
