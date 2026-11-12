import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The migrate image's one-off scripts, run the way the image runs them: `pnpm deploy` puts the
// cms-config package (src, node_modules, package.json) in /app and the Dockerfile copies
// infra/migrate/*.ts next to it. Staged here the same way, minus the image.
const root = path.resolve(import.meta.dirname, '..')
const pkg = path.join(root, 'packages/cms-config')
const app = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-image-'))
afterAll(() => fs.rmSync(app, { recursive: true, force: true }))

fs.symlinkSync(path.join(pkg, 'node_modules'), path.join(app, 'node_modules'))
fs.symlinkSync(path.join(pkg, 'src'), path.join(app, 'src'))
fs.copyFileSync(path.join(pkg, 'package.json'), path.join(app, 'package.json'))
for (const file of fs.readdirSync(path.join(root, 'infra/migrate'))) {
  fs.copyFileSync(path.join(root, 'infra/migrate', file), path.join(app, file))
}
// Not in the image: logs in, to prove the password the reset printed works.
fs.writeFileSync(
  path.join(app, 'login-check.ts'),
  `import { getPayload } from 'payload'
import config from './payload.config.ts'
const payload = await getPayload({ config })
let code = 0
try {
  await payload.login({ collection: 'users', data: { email: process.argv[2], password: process.env.CHECK_PASSWORD } })
} catch { code = 1 } finally { await payload.destroy() }
process.exit(code)
`,
)

const env = {
  PATH: process.env.PATH ?? '',
  PAYLOAD_SECRET: 'x',
  PAYLOAD_DB_PUSH: 'true',
  PAYLOAD_CONFIG_PATH: path.join(app, 'payload.config.ts'),
  DATABASE_PATH: path.join(app, 'data/cms.db'),
}
const run = (argv: string[], extra: Record<string, string> = {}) =>
  spawnSync(process.execPath, ['node_modules/payload/bin.js', 'run', ...argv], {
    cwd: app,
    encoding: 'utf8',
    env: { ...env, ...extra },
  })
const loginWorks = (email: string, password: string) =>
  run(['login-check.ts', '--', email], { CHECK_PASSWORD: password }).status === 0

describe('reset-password.ts in the migrate image', () => {
  beforeAll(() => {
    fs.mkdirSync(path.join(app, 'data'))
    const seeded = run(['seed-production.ts'], {
      SEED_DEVELOPER_EMAIL: 'dev@example.com',
      SEED_DEVELOPER_PASSWORD: 'dev-password-1234',
      SEED_TAHA_EMAIL: 'taha@example.com',
      SEED_TAHA_PASSWORD: 'taha-password-1234',
    })
    expect(seeded.status, seeded.stderr).toBe(0)
  }, 120_000)

  it('fails with a usage line when no email is given', () => {
    const result = run(['reset-password.ts', '--'])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/Usage/)
  }, 60_000)

  it('changes nothing for an unknown email', () => {
    const result = run(['reset-password.ts', '--', 'nobody@example.com'])
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/No Editor/)
  }, 60_000)

  it('sets NEW_PASSWORD without printing it', () => {
    const password = 'chosen-password-1234'
    const result = run(['reset-password.ts', '--', 'taha@example.com'], { NEW_PASSWORD: password })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout + result.stderr).not.toContain(password)
    expect(loginWorks('taha@example.com', password)).toBe(true)
  }, 120_000)

  it('prints a random password once when NEW_PASSWORD is unset, and it logs in', () => {
    const result = run(['reset-password.ts', '--', 'dev@example.com'])
    expect(result.status, result.stderr).toBe(0)
    const password = /New password: (\S+)/.exec(result.stdout)?.[1] ?? ''
    expect(password.length).toBeGreaterThanOrEqual(12)
    expect(result.stdout.split(password)).toHaveLength(2)
    expect(loginWorks('dev@example.com', password)).toBe(true)
  }, 120_000)
})
