import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

// Repo guards for the two media workflows (ADR-0006): they enforce rules, not behaviour.
const path = (name: string) => new URL(`../../.github/workflows/${name}`, import.meta.url).pathname
const code = (name: string) =>
  readFileSync(path(name), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n')

describe('media-backup workflow', () => {
  const text = code('media-backup.yml')

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
})

describe('media-trash-cleanup workflow', () => {
  test('uses the media bucket key, never the backup bucket', () => {
    const text = code('media-trash-cleanup.yml')
    expect(text).toContain('run: node media-trash.ts')
    expect(text).toContain('S3_BUCKET: taha-media')
    expect(text).not.toMatch(/backup/i)
  })
})

test('both workflows are actionlint clean (when actionlint is installed)', () => {
  for (const name of ['media-backup.yml', 'media-trash-cleanup.yml']) {
    const r = spawnSync('actionlint', [path(name)], { encoding: 'utf8' })
    if (r.error) return
    expect(r.stdout + r.stderr, name).toBe('')
  }
})
