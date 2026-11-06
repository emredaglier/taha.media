import http from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { siteConfigOptionsFromEnv } from './config'

/** A stand-in for `web`'s revalidate route that records what it received. */
type Received = { method?: string; secret?: string; body: unknown }
let received: Received[] = []
let status = 200
let hang = false
let server: http.Server
let url: string

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString()))
    req.on('end', () => {
      received.push({
        method: req.method,
        secret: req.headers['x-revalidate-secret'] as string | undefined,
        body: JSON.parse(body) as unknown,
      })
      if (hang) return
      res.writeHead(status).end('{}')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/internal/revalidate`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(() => {
  received = []
  status = 200
  hang = false
})

const base = { DATABASE_PATH: 'x.db', PAYLOAD_SECRET: 's' }
const cms = (env: Record<string, string> = {}) =>
  siteConfigOptionsFromEnv('cms', { ...base, REVALIDATE_URL: url, REVALIDATE_SECRET: 'r', ...env })

describe('the production transport (REVALIDATE_URL, REVALIDATE_SECRET)', () => {
  it("POSTs the tags with the shared secret to web's revalidate route", async () => {
    await cms().revalidate?.(['work:3', 'works'])
    expect(received).toEqual([{ method: 'POST', secret: 'r', body: { tags: ['work:3', 'works'] } }])
  })

  it('fails when web refuses, so the notifier can log it', async () => {
    status = 401
    await expect(cms().revalidate?.(['works'])).rejects.toThrow(/401/)
  })

  it('gives up on a web that does not answer', async () => {
    hang = true
    const started = Date.now()
    await expect(cms({ REVALIDATE_TIMEOUT_MS: '50' }).revalidate?.(['works'])).rejects.toThrow()
    expect(Date.now() - started).toBeLessThan(1500)
  })
})

describe('revalidation settings', () => {
  it('refuse a URL without a secret', () => {
    expect(() =>
      siteConfigOptionsFromEnv('cms', { ...base, REVALIDATE_URL: 'http://web:3000/x' }),
    ).toThrow(/REVALIDATE_SECRET/)
  })

  it('are required for cms in production, or published pages would never refresh', () => {
    const production = { ...base, NODE_ENV: 'production', CMS_ORIGINS: 'https://cms.ts.net' }
    expect(() => siteConfigOptionsFromEnv('cms', production)).toThrow(/REVALIDATE_URL/)
    expect(
      siteConfigOptionsFromEnv('cms', {
        ...production,
        REVALIDATE_URL: 'http://web:3000/internal/revalidate',
        REVALIDATE_SECRET: 'r',
      }).revalidate,
    ).toBeTypeOf('function')
  })

  it('stay optional in local dev, for `next build`, and are never used by web', () => {
    expect(siteConfigOptionsFromEnv('cms', base).revalidate).toBeUndefined()
    expect(
      siteConfigOptionsFromEnv('cms', {
        ...base,
        NODE_ENV: 'production',
        NEXT_PHASE: 'phase-production-build',
      }).revalidate,
    ).toBeUndefined()
    expect(
      siteConfigOptionsFromEnv('web', { ...base, REVALIDATE_URL: url, REVALIDATE_SECRET: 'r' })
        .revalidate,
    ).toBeUndefined()
  })
})
