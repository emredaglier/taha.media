import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { loadCompose } from './compose-config'

// Seam 3: the only way to cms and the preview instance is `tailscale serve` on the loopback ports
// the Compose file publishes (ADR-0001). The two must agree, and the HTTPS ports must not be 443,
// which Caddy takes (a boot-order clash took a site down once).
const script = path.resolve(import.meta.dirname, 'tailscale-serve.sh')
const dryRun = () => spawnSync('bash', [script, '--dry-run'], { encoding: 'utf8' })

describe('tailscale-serve.sh', () => {
  const compose = loadCompose('compose.yaml')
  const hostPort = (service: string) =>
    /127\.0\.0\.1:(\d+):/.exec(compose.services[service]?.ports?.[0] ?? '')?.[1]

  it('forwards the loopback ports that Compose publishes for cms and web-preview', () => {
    const { stdout, status } = dryRun()
    expect(status).toBe(0)
    expect(stdout).toContain(`http://127.0.0.1:${hostPort('cms')}`)
    expect(stdout).toContain(`http://127.0.0.1:${hostPort('web-preview')}`)
  })

  it('serves them over HTTPS on ports other than 443, which Caddy publishes', () => {
    const ports = [...dryRun().stdout.matchAll(/--https=(\d+)/g)].map((m) => m[1])
    expect(ports).toHaveLength(2)
    expect(new Set(ports).size).toBe(2)
    expect(ports).not.toContain('443')
  })

  it('refuses an invalid port instead of exposing the wrong service', () => {
    const result = spawnSync('bash', [script, '--dry-run'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', CMS_PORT: 'abc' },
    })
    expect(result.status).not.toBe(0)
  })
})
