import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: [
      'tests/firestore-rules.test.ts',
      'tests/menu-publish-resolution.test.ts',
      'tests/orders-write-path.test.ts',
      'tests/middleware-branch-admin-guard.test.ts',
      'node_modules/**',
      '.claude/**',
    ],
  },
});
