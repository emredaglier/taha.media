import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'scripts/**/*.test.ts',
      'infra/**/*.test.ts',
      '{apps,packages}/*/src/**/*.test.{ts,tsx}',
    ],
  },
})
