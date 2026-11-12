import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildSiteConfig, siteConfigOptionsFromEnv } from './config'
import { VIDEO_LIMITS } from './video-limits'

const base = { DATABASE_PATH: 'x.db', PAYLOAD_SECRET: 's' }

describe('siteConfigOptionsFromEnv', () => {
  it('requires the database path and secret', () => {
    expect(() => siteConfigOptionsFromEnv('cms', {})).toThrow(/DATABASE_PATH/)
    expect(() => siteConfigOptionsFromEnv('cms', { DATABASE_PATH: 'x.db' })).toThrow(
      /PAYLOAD_SECRET/,
    )
  })

  it('reads the optional values', () => {
    expect(
      siteConfigOptionsFromEnv('web', {
        ...base,
        PAYLOAD_DB_PUSH: 'false',
        CMS_ORIGINS: 'https://a.ts.net, https://b.ts.net',
      }),
    ).toEqual({
      role: 'web',
      databasePath: 'x.db',
      secret: 's',
      push: false,
      origins: ['https://a.ts.net', 'https://b.ts.net'],
      storage: {},
    })
  })
})

describe('CMS_ORIGINS', () => {
  it('is required for cms in production, because an empty list turns CSRF checks off', () => {
    expect(() => siteConfigOptionsFromEnv('cms', { ...base, NODE_ENV: 'production' })).toThrow(
      /CMS_ORIGINS/,
    )
    expect(() =>
      siteConfigOptionsFromEnv('cms', { ...base, NODE_ENV: 'production', CMS_ORIGINS: ' , ' }),
    ).toThrow(/CMS_ORIGINS/)
  })

  it('stays optional in local dev and tests, for `next build`, and for web', () => {
    for (const env of [
      { ...base, NODE_ENV: 'development' },
      { ...base, NODE_ENV: 'test' },
      { ...base, NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' },
    ]) {
      expect(siteConfigOptionsFromEnv('cms', env).origins).toEqual([])
    }
    expect(siteConfigOptionsFromEnv('web', { ...base, NODE_ENV: 'production' }).origins).toEqual([])
  })
})

describe('upload limits', () => {
  it('let the largest video cap through Payload multipart, so our Turkish refusal speaks first', async () => {
    const config = await buildSiteConfig(
      siteConfigOptionsFromEnv('cms', {
        ...base,
        DATABASE_PATH: path.join(os.tmpdir(), 'taha-config-test', 'site.db'),
      }),
    )
    const largest = Math.max(...Object.values(VIDEO_LIMITS).map((limits) => limits.maxBytes))
    expect(config.upload?.limits?.fileSize).toBeGreaterThanOrEqual(largest)
    expect(config.upload?.requestSizeLimit).toBeGreaterThan(config.upload?.limits?.fileSize ?? 0)
  })

  it('spool admin uploads to the OS temp folder, which the cms image user can write, not memory', async () => {
    const config = await buildSiteConfig(
      siteConfigOptionsFromEnv('cms', {
        ...base,
        DATABASE_PATH: path.join(os.tmpdir(), 'taha-config-test', 'site.db'),
      }),
    )
    expect(config.upload?.useTempFiles).toBe(true)
    expect(config.upload?.tempFileDir).toBe(os.tmpdir())
  })
})
