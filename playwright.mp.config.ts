import { defineConfig, devices } from '@playwright/test';

/**
 * Multiplayer E2E: several independent browser contexts (= devices) against
 * the Firebase Emulator Suite. Run with `npm run test:e2e:mp`, which starts
 * the emulators first. The app is built with the emulator flag into dist-mp.
 */
const PORT = 4174;

export default defineConfig({
  testDir: 'tests/e2e-mp',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['iPhone 13'],
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
    serviceWorkers: 'block',
  },
  webServer: {
    command: `VITE_FIREBASE_EMULATOR=1 VITE_FIREBASE_EMULATOR_HOST=127.0.0.1 npx vite build --outDir dist-mp && npx vite preview --outDir dist-mp --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
