import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'scripts/**/*.test.ts',
      'infra/**/*.test.ts',
      '{apps,packages}/*/src/**/*.test.{ts,tsx}',
    ],
    // `next/cache` only works inside a running Next server; tests get an in-memory stand-in.
    setupFiles: ['apps/web/src/test/next-cache-setup.ts'],
  },
})
