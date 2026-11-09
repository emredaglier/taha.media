import fs from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import config from '../next.config'

it('sends no Client Hints headers: Payload adds them for its admin, and Chrome re-requests the first page for Critical-CH', async () => {
  const rules = (await config.headers?.()) ?? []
  const names = rules.flatMap((rule) => rule.headers.map(({ key, value }) => `${key}: ${value}`))
  expect(names.filter((line) => /accept-ch|critical-ch|sec-ch-/i.test(line))).toEqual([])
})

describe('Docker build hooks', () => {
  const load = async (env: Record<string, string>) => {
    vi.resetModules()
    for (const name of ['NEXT_STANDALONE', 'ASSET_PREFIX', 'DEPLOYMENT_ID']) {
      vi.stubEnv(name, env[name] ?? '')
    }
    return (await import('../next.config')).default
  }
  afterEach(() => vi.unstubAllEnvs())

  it('builds a plain app by default: no standalone output, no asset prefix, no deployment id', async () => {
    const built = await load({})
    expect(built.output).toBeUndefined()
    expect(built.assetPrefix).toBeUndefined()
    expect(built.deploymentId).toBeUndefined()
  })

  it('builds the self-contained server the image runs, traced from the monorepo root', async () => {
    const built = await load({ NEXT_STANDALONE: '1' })
    expect(built.output).toBe('standalone')
    // The root holds the workspace packages the server bundle needs.
    expect(fs.existsSync(path.join(built.outputFileTracingRoot ?? '', 'packages/cms-config'))).toBe(
      true,
    )
  })

  it('takes the CDN prefix and the deployment id from the build arguments (ADR-0005)', async () => {
    const built = await load({
      ASSET_PREFIX: 'https://cdn.taha.media/releases/abc',
      DEPLOYMENT_ID: 'abc',
    })
    expect(built.assetPrefix).toBe('https://cdn.taha.media/releases/abc')
    expect(built.deploymentId).toBe('abc')
  })
})

describe('Sentry source maps (#35)', () => {
  const load = async (env: Record<string, string>) => {
    vi.resetModules()
    for (const name of ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']) {
      vi.stubEnv(name, env[name] ?? '')
    }
    return (await import('../next.config')).default
  }
  afterEach(() => vi.unstubAllEnvs())

  it.each([
    ['no settings', {}],
    ['no auth token', { SENTRY_ORG: 'o', SENTRY_PROJECT: 'p' }],
    ['no org', { SENTRY_AUTH_TOKEN: 't', SENTRY_PROJECT: 'p' }],
    ['no project', { SENTRY_AUTH_TOKEN: 't', SENTRY_ORG: 'o' }],
  ])('generates and uploads no source maps with %s', async (_name, env) => {
    expect((await load(env)).productionBrowserSourceMaps).toBeUndefined()
  })

  it('generates source maps for the upload when the token, org and project are all set', async () => {
    const built = await load({ SENTRY_AUTH_TOKEN: 't', SENTRY_ORG: 'o', SENTRY_PROJECT: 'p' })
    expect(built.productionBrowserSourceMaps).toBe(true)
  })
})
