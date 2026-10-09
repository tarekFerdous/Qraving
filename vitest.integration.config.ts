import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Integration tests excluded from the default `vitest run`. All but the
// middleware guard need a Firestore emulator on 127.0.0.1:8080
// (`firebase emulators:start --only firestore`).
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: [
      'tests/firestore-rules.test.ts',
      'tests/menu-publish-resolution.test.ts',
      'tests/orders-write-path.test.ts',
      'tests/middleware-branch-admin-guard.test.ts',
    ],
    // The emulator-backed suites share one database; run files serially.
    fileParallelism: false,
  },
});
