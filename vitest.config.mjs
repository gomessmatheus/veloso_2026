import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/lib/fx.js'],
      thresholds: { lines: 90, functions: 90, branches: 85 },
      reporter: ['text'],
    },
  },
});
