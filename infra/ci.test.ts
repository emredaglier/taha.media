import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')

// Repo guard: a docs-only change must start no run, and main and pull requests must both run.
test('CI runs on pull requests and main, but not for changes only under docs/', () => {
  expect(workflow).toMatch(/push:\s+branches: \[main\]/)
  expect(workflow).toMatch(/pull_request:/)
  expect(workflow.match(/- '!docs\/\*\*'/g)).toHaveLength(2)
})

test('CI runs the same gate as a laptop: pnpm check steps', () => {
  for (const step of ['pnpm lint', 'pnpm typecheck', 'pnpm test', 'pnpm build']) {
    expect(workflow).toContain(`run: ${step}`)
  }
})
