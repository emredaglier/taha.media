import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Integration tests build a SQLite schema and upload fixtures; on a busy machine
    // (parallel agents, CI) the 5s default flakes.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: [
      'scripts/**/*.test.ts',
      'infra/**/*.test.ts',
      '{apps,packages}/*/src/**/*.test.{ts,tsx}',
    ],
    // `next/cache` only works inside a running Next server; tests get an in-memory stand-in.
    setupFiles: ['apps/web/src/test/next-cache-setup.ts'],
  },
})
