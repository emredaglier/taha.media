import { spawn } from 'node:child_process'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ACCOUNT, TOKEN, ZONE, startMock } from './cloudflare-mock'

const script = path.resolve(import.meta.dirname, 'settings.sh')
const z = `/zones/${ZONE}`
const cachePath = `${z}/rulesets/phases/http_request_cache_settings/entrypoint`

let mock: Awaited<ReturnType<typeof startMock>>

const run = (args: string[], env: Record<string, string> = {}) =>
  new Promise<{ code: number | null; out: string }>((resolve) => {
    const child = spawn('bash', [script, ...args], {
      env: {
        PATH: process.env.PATH ?? '',
        CLOUDFLARE_API_BASE: mock.base,
        CLOUDFLARE_API_TOKEN: TOKEN,
        CLOUDFLARE_ZONE_ID: ZONE,
        CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
        ...env,
      },
    })
    let out = ''
    child.stdout.on('data', (d: Buffer) => (out += d))
    child.stderr.on('data', (d: Buffer) => (out += d))
    child.on('close', (code) => resolve({ code, out }))
  })

type Rule = { expression: string; action: string; action_parameters: Record<string, unknown> }
const appliedRules = () =>
  (mock.writes.find((x) => x.method === 'PUT' && x.path === cachePath)?.body as { rules: Rule[] })
    .rules

beforeEach(async () => {
  mock = await startMock()
})
afterEach(async () => {
  await mock.close()
})

describe('infra/cloudflare/settings.sh', () => {
  it('plan mode (the default) reports changes and makes no writes', async () => {
    const { code, out } = await run([])
    expect(code).toBe(0)
    expect(mock.writes).toEqual([])
    expect(out).toContain('PLAN')
    expect(out).toMatch(/\d+ change\(s\) planned/)
  })

  it('apply turns off Bot Fight Mode, Rocket Loader, Email Obfuscation, Always Online and analytics auto-injection', async () => {
    const { code } = await run(['--apply'])
    expect(code).toBe(0)
    expect(mock.state.zoneSettings).toMatchObject({
      ssl: 'strict',
      rocket_loader: 'off',
      email_obfuscation: 'off',
      always_online: 'off',
    })
    expect(mock.state.botFightMode).toBe(false)
    expect(mock.state.rumSites[0]?.auto_install).toBe(false)
  })

  it('cache rules cover only the CDN host and /_next/static, and never HTML or RSC', async () => {
    await run(['--apply'])
    const rules = appliedRules()
    const cached = rules.filter((r) => r.action_parameters.cache === true)
    const bypassed = rules.filter((r) => r.action_parameters.cache === false)

    // Cached rules respect the origin's immutable headers.
    for (const r of cached) {
      expect(r.action_parameters).toMatchObject({
        edge_ttl: { mode: 'respect_origin' },
        browser_ttl: { mode: 'respect_origin' },
      })
    }
    expect(cached.map((r) => r.expression)).toEqual([
      '(http.host eq "cdn.taha.media")',
      '(http.host in {"taha.media" "www.taha.media"} and starts_with(http.request.uri.path, "/_next/static/"))',
    ])
    // The main domain bypass excludes the static path, so it cannot override the rule above.
    expect(bypassed).toHaveLength(1)
    expect(bypassed[0]?.expression).toBe(
      '(http.host in {"taha.media" "www.taha.media"} and not starts_with(http.request.uri.path, "/_next/static/"))',
    )
    expect(rules).toHaveLength(3)
  })

  it('a second run plans nothing and writes nothing', async () => {
    await run(['--apply'])
    mock.writes.length = 0
    const plan = await run([])
    expect(plan.out).toContain('0 change(s) planned')
    expect(plan.out).not.toContain('PLAN')
    const again = await run(['--apply'])
    expect(again.code).toBe(0)
    expect(mock.writes).toEqual([])
  })

  it('only changes what drifted', async () => {
    await run(['--apply'])
    mock.writes.length = 0
    mock.state.zoneSettings.rocket_loader = 'on'
    await run(['--apply'])
    expect(mock.writes.map((x) => `${x.method} ${x.path}`)).toEqual([
      `PATCH ${z}/settings/rocket_loader`,
    ])
  })

  it('replaces a hand-made cache rule that would cache HTML', async () => {
    await run(['--apply'])
    mock.writes.length = 0
    mock.state.cacheRules = [
      {
        description: 'by hand',
        expression: '(http.host eq "taha.media")',
        action: 'set_cache_settings',
        action_parameters: { cache: true },
        enabled: true,
      },
    ]
    await run(['--apply'])
    expect(appliedRules()).toHaveLength(3)
    expect(appliedRules().some((r) => r.expression === '(http.host eq "taha.media")')).toBe(false)
  })

  it('a 403 on the Web Analytics site list is a warning, and the rest of the plan still runs', async () => {
    mock.state.rumForbidden = true
    const { code, out } = await run([])
    expect(code).toBe(0)
    expect(out).toContain('WARN     Web Analytics auto-injection')
    expect(out).toContain('PLAN     Bot Fight Mode')
  })

  it('refuses to run without credentials, before any request', async () => {
    const { code, out } = await run([], { CLOUDFLARE_API_TOKEN: '' })
    expect(code).not.toBe(0)
    expect(out).toContain('CLOUDFLARE_API_TOKEN')
    expect(mock.reads).toEqual([])
  })

  it('stops with an error when the API rejects the token', async () => {
    const { code, out } = await run(['--apply'], { CLOUDFLARE_API_TOKEN: 'wrong' })
    expect(code).not.toBe(0)
    expect(out).toContain('403')
    expect(mock.writes).toEqual([])
  })

  it('rejects unknown arguments', async () => {
    const { code } = await run(['--bogus'])
    expect(code).not.toBe(0)
  })
})
