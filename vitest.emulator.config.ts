import { defineConfig } from 'vitest/config';

/** Integration tests that need the Firebase Emulator Suite (npm run test:emulator). */
export default defineConfig({
  test: {
    include: ['tests/emulator/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
