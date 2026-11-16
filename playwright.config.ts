import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
    serviceWorkers: 'block',
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'phone-360', use: { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 } } },
    { name: 'phone-390', use: { ...devices['iPhone 13'], browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    { name: 'tablet-768', use: { browserName: 'chromium', viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: 'desktop-1280', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
  ],
});
