import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'server/test/**/*.test.ts',
      'shared/test/**/*.test.ts',
      // `.tsx` too: the client smoke tests render components, and a component
      // test that is silently not collected is worse than no test at all.
      'desktop/test/**/*.test.{ts,tsx}',
    ],
    // Integration tests share one database; running files in parallel would make
    // them fight over the same rows.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
