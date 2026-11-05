import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

/**
 * Release-gate smoke (spec #1, Seam 2). `pnpm smoke` (smoke/run.ts) builds the image, starts the
 * stack and then runs this with the SMOKE_* variables set (see run.ts). Desktop Chromium only,
 * headless, so it runs the same in CI. Never run it by hand without those variables: the spec
 * throws when they are missing.
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const out = process.env.SMOKE_OUTPUT_DIR ?? path.join(here, '.output')

export default defineConfig({
  testDir: here,
  testMatch: '*.spec.ts',
  outputDir: path.join(out, 'results'),
  reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(out, 'report') }]],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.SMOKE_BASE_URL,
    // Kept on failure only: traces and screenshots land in <out>/results.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } }],
})
