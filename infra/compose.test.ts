import { describe, expect, it } from 'vitest'

import { loadCompose, type Compose, type Service } from './compose-config'

// Seam 3: the Compose files, read without Docker. The production file alone, and the laptop
// override on top of it (what `docker compose -f compose.yaml -f compose.local.yaml` runs).
const files = {
  production: ['compose.yaml'],
  local: ['compose.yaml', 'compose.local.yaml'],
} as const

const APP_SERVICES = ['web', 'web-preview', 'cms'] as const
const MIB = 1024 * 1024
const GIB = 1024 * MIB

/** `384m` / `1g` as bytes. */
function bytes(limit: string | undefined): number {
  const match = /^(\d+)([kmg])$/i.exec(limit ?? '')
  if (!match) throw new Error(`not a memory limit: ${limit}`)
  const unit = { k: 1024, m: MIB, g: GIB }[match[2]!.toLowerCase() as 'k' | 'm' | 'g']
  return Number(match[1]) * unit
}

const dependsOn = (service: Service) => Object.keys(service.depends_on ?? {})
const loopback = (port: string) => /^(127\.0\.0\.1|\[::1\]):/.test(port)

describe.each(Object.entries(files))('compose (%s)', (variant, list) => {
  const compose: Compose = loadCompose(...list)
  const svc = (name: string): Service => {
    const service = compose.services[name]
    if (!service) throw new Error(`no service ${name}`)
    return service
  }
  const longRunning = Object.keys(compose.services).filter((name) => name !== 'migrate')

  it('runs caddy, web, web-preview, cms, litestream and a one-off migrate', () => {
    for (const name of ['caddy', 'web', 'web-preview', 'cms', 'litestream', 'migrate']) {
      expect(compose.services, name).toHaveProperty(name)
    }
  })

  it('gives every service a memory limit, and the limits fit the server', () => {
    for (const name of Object.keys(compose.services)) {
      expect(bytes(svc(name).mem_limit), name).toBeGreaterThanOrEqual(64 * MIB)
    }
    // The smallest VPS plan has 4 GB; the OS, Docker and the swap file need the rest.
    const total = Object.values(compose.services).reduce((sum, s) => sum + bytes(s.mem_limit), 0)
    expect(total).toBeLessThanOrEqual(3 * GIB)
  })

  it('restarts every long-running service unless stopped, and never the one-off migrate', () => {
    for (const name of longRunning) expect(svc(name).restart, name).toBe('unless-stopped')
    expect(svc('migrate').restart).toBe('no')
  })

  it('health-checks every long-running service', () => {
    for (const name of longRunning) {
      const check = svc(name).healthcheck
      expect(check?.test, name).toBeTruthy()
      expect(check?.interval, name).toBeTruthy()
    }
  })

  it('runs migrations to completion before web, web-preview, cms and litestream start', () => {
    for (const name of [...APP_SERVICES, 'litestream']) {
      expect(svc(name).depends_on?.migrate?.condition, name).toBe('service_completed_successfully')
    }
    // Nothing the migration needs waits on a service that waits on it.
    expect(dependsOn(svc('migrate'))).toEqual([])
    // The migrate container is the release's own image, so it carries the release's migrations.
    expect(svc('migrate').image).toMatch(/\/migrate:\$\{RELEASE/)
  })

  it('starts caddy only once web is healthy', () => {
    expect(svc('caddy').depends_on?.web?.condition).toBe('service_healthy')
  })

  it('publishes nothing on a public interface except caddy', () => {
    for (const name of Object.keys(compose.services).filter((n) => n !== 'caddy')) {
      for (const port of svc(name).ports ?? [])
        expect(loopback(String(port)), `${name} ${port}`).toBe(true)
    }
  })

  it('binds cms and the preview instance to loopback only: tailscale serve is their only way out', () => {
    expect(svc('cms').ports?.length).toBeGreaterThan(0)
    for (const name of ['cms', 'web-preview']) {
      for (const port of svc(name).ports ?? []) expect(port, name).toMatch(/^127\.0\.0\.1:/)
    }
    // web is reached through caddy on the Docker network only.
    expect(svc('web').ports ?? []).toEqual([])
  })

  it('keeps the database off every service that is not meant to touch it', () => {
    for (const name of ['caddy']) {
      expect((svc(name).volumes ?? []).join(' '), name).not.toMatch(/(^|\s)data:/)
    }
    // The data volume is the only thing the three Node services and litestream share.
    for (const name of [...APP_SERVICES, 'litestream', 'migrate']) {
      expect(
        (svc(name).volumes ?? []).some((v) => v.startsWith('data:/data')),
        name,
      ).toBe(true)
    }
  })

  it('opens the database as web (read-only at connection level) in web and web-preview, with no write secrets', () => {
    for (const name of ['web', 'web-preview']) {
      const service = svc(name)
      // The laptop override replaces the env file with inline dummy settings.
      if (variant === 'production') expect(String(service.env_file), name).toMatch(/web\.env$/)
      const env = Object.keys(service.environment ?? {})
      expect(
        env.filter((key) => /^S3_|^SEED_|^CMS_ORIGINS$|^REVALIDATE_URL$/.test(key)),
        name,
      ).toEqual([])
      // Only data:/data, so a Work's media or a secret file cannot be reached from the site.
      expect(service.volumes, name).toEqual(['data:/data'])
    }
  })

  it('runs web and web-preview from one image, and only web-preview with PREVIEW=1', () => {
    expect(svc('web-preview').image).toBe(svc('web').image)
    expect(svc('web-preview').environment?.PREVIEW).toBe('1')
    expect(svc('web').environment).not.toHaveProperty('PREVIEW')
    expect(svc('cms').environment).not.toHaveProperty('PREVIEW')
  })

  it('points cms and migrate at web (not web-preview) for revalidation, and keeps the secret equal', () => {
    expect(new URL(String(svc('cms').environment?.REVALIDATE_URL)).hostname).toBe('web')
    expect(svc('migrate').environment?.REVALIDATE_URL).toBe(svc('cms').environment?.REVALIDATE_URL)
    expect(svc('web-preview').environment).not.toHaveProperty('REVALIDATE_URL')
    if (variant === 'local') {
      const secrets = ['cms', 'migrate', 'web'].map((n) => svc(n).environment?.REVALIDATE_SECRET)
      expect(secrets[0]).toBeTruthy()
      expect(new Set(secrets).size).toBe(1)
    } else {
      expect(String(svc('migrate').env_file)).toMatch(/cms\.env$/)
      expect(String(svc('cms').env_file)).toMatch(/cms\.env$/)
    }
  })

  it('lets web sign nothing it could share with cms: separate PAYLOAD_SECRET where they are set here', () => {
    const secrets = ['web', 'cms'].map((n) => svc(n).environment?.PAYLOAD_SECRET)
    if (variant === 'local') {
      expect(secrets[0]).toBeTruthy()
      expect(secrets[1]).toBeTruthy()
      expect(secrets[0]).not.toBe(secrets[1])
    }
  })
})

describe('compose (production file)', () => {
  const compose = loadCompose('compose.yaml')

  it('pins every third-party image to a version, never latest', () => {
    for (const [name, service] of Object.entries(compose.services)) {
      if (service.image?.includes('${')) continue // our own images: tagged by RELEASE
      expect(service.image, name).toMatch(/:\d+\.\d+/)
    }
  })

  it('keeps secrets out of the repo: env files live outside it, and no secret is set inline', () => {
    for (const [name, service] of Object.entries(compose.services)) {
      // An absolute path or an `${ENV_DIR...}` path on the server, never one relative to the repo.
      for (const file of [service.env_file ?? []].flat()) {
        expect(String(file), name).toMatch(/^(\/|\$\{)/)
      }
      const inline = Object.keys(service.environment ?? {})
      expect(
        inline.filter((key) => /SECRET|PASSWORD|TOKEN|ACCESS_KEY|DSN/.test(key)),
        name,
      ).toEqual([])
    }
  })
})

describe('compose (laptop override)', () => {
  const compose = loadCompose('compose.yaml', 'compose.local.yaml')

  it('replaces the server paths and secrets: no env_file, a Docker-managed data volume', () => {
    for (const name of ['migrate', 'web', 'web-preview', 'cms', 'litestream']) {
      expect(compose.services[name]?.env_file ?? [], name).toEqual([])
    }
    expect(JSON.stringify(compose.volumes?.data ?? {})).not.toContain('/opt/taha')
  })

  it('publishes caddy on loopback only, not on the laptop’s public interfaces', () => {
    const ports = compose.services.caddy?.ports ?? []
    expect(ports.length).toBeGreaterThan(0)
    for (const port of ports) expect(loopback(String(port)), String(port)).toBe(true)
  })

  it('replicates litestream to a local S3 stand-in, never to R2', () => {
    const env = compose.services.litestream?.environment ?? {}
    expect(env.LITESTREAM_ENDPOINT).toMatch(/^http:\/\/s3mock:/)
    expect(compose.services.litestream?.depends_on?.s3mock?.condition).toBe('service_healthy')
  })
})
