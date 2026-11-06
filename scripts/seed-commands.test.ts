import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

// The seed and reset commands run through `payload run`, which rewrites process.argv and drops
// flags before a `--`. The function-level tests miss that, so these run the real command line.
const root = path.resolve(import.meta.dirname, '..')
const cmsDir = path.join(root, 'apps/cms')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-commands-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

const script = (name: string): string[] => {
  const pkg = JSON.parse(fs.readFileSync(path.join(cmsDir, 'package.json'), 'utf8'))
  return (pkg.scripts[name] as string).split(/\s+/).slice(1)
}

const run = (argv: string[], env: Record<string, string>) =>
  spawnSync(process.execPath, ['node_modules/payload/bin.js', ...argv], {
    cwd: cmsDir,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', PAYLOAD_SECRET: 'x', ...env },
  })

describe('the root scripts', () => {
  it('expose seed, seed:production and user:reset-password through apps/cms', () => {
    const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    for (const name of ['seed', 'seed:production', 'user:reset-password']) {
      expect(rootPkg.scripts[name]).toBe(`pnpm --filter @taha/cms ${name}`)
    }
  })
})

describe('pnpm seed', () => {
  it.each([
    ['NODE_ENV=production', { NODE_ENV: 'production' }],
    ['TAHA_ENV=production', { TAHA_ENV: 'production' }],
    ['R2 settings', { MEDIA_ORIGIN: 'https://media.example.com', S3_BUCKET: 'b' }],
  ])(
    'refuses %s before opening or creating the database',
    (_, env) => {
      const dir = path.join(tmp, 'refused', String(Math.random()))
      const result = run([...script('seed')], { DATABASE_PATH: path.join(dir, 'x.db'), ...env })
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/production/i)
      expect(fs.existsSync(dir)).toBe(false)
    },
    60_000,
  )
})

describe('pnpm user:reset-password', () => {
  it('fails with a usage line when no email is given', () => {
    const noArgs = run(script('user:reset-password'), { DATABASE_PATH: path.join(tmp, 'y.db') })
    expect(noArgs.status).not.toBe(0)
    expect(noArgs.stderr).toMatch(/Usage/)
  }, 60_000)
})
