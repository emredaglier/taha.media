import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

// Repo guard for the media-backup workflow (ADR-0006): it enforces rules, not behaviour.
const file = new URL('../../.github/workflows/media-backup.yml', import.meta.url).pathname
const text = readFileSync(file, 'utf8')
  .split('\n')
  .filter((l) => !l.trim().startsWith('#'))
  .join('\n')

test('runs the backup script nightly, read-only, and never a delete', () => {
  expect(text).toMatch(/schedule:/)
  expect(text).toMatch(/permissions:\n\s+contents: read/)
  expect(text).toContain('run: infra/media-backup/media-backup.sh')
  expect(text).not.toMatch(/\bdelete|\bpurge|\bsync\b|--remove/i)
})

test('installs a pinned, checksummed rclone and sets no RCLONE_* variable except remote config', () => {
  expect(text).toMatch(/PINNED_RCLONE_VERSION: v\d+\.\d+\.\d+/)
  expect(text).toMatch(/PINNED_RCLONE_SHA256: [0-9a-f]{64}/)
  expect(text).toMatch(/sha256sum -c/)
  expect(text).not.toMatch(/^\s+RCLONE_(?!CONFIG_)[A-Z_]+:/m)
})

test('is actionlint clean (when actionlint is installed)', () => {
  const r = spawnSync('actionlint', [file], { encoding: 'utf8' })
  if (r.error) return
  expect(r.stdout + r.stderr).toBe('')
})
