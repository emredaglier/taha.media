import os from 'node:os'
import path from 'node:path'

import type { SanitizedConfig } from 'payload'
import { describe, expect, it } from 'vitest'

import { buildSiteConfig, siteConfigOptionsFromEnv } from './config'

const PREVIEW_URL = 'https://preview.tail1234.ts.net'

/** The cms config as the admin app builds it from its environment. */
const cmsConfig = (env: Record<string, string> = {}) =>
  buildSiteConfig(
    siteConfigOptionsFromEnv('cms', {
      DATABASE_PATH: path.join(os.tmpdir(), 'taha-preview-test', 'site.db'),
      PAYLOAD_SECRET: 's',
      ...env,
    }),
  )

type PreviewButton = (doc: Record<string, unknown>, options: object) => unknown

/** What the admin's preview button opens for a document of that collection or page. */
function previewButton(config: SanitizedConfig, slug: string): PreviewButton | undefined {
  const entity =
    config.collections.find((collection) => collection.slug === slug) ??
    config.globals.find((global) => global.slug === slug)
  return entity?.admin.preview as PreviewButton | undefined
}

const open = (config: SanitizedConfig, slug: string, doc: Record<string, unknown> = {}) =>
  previewButton(config, slug)?.(doc, { locale: 'tr', req: {}, token: null })

describe("the admin's preview button (PREVIEW_URL)", () => {
  it('opens a Work on the preview instance at its own page', async () => {
    const config = await cmsConfig({ PREVIEW_URL })
    expect(await open(config, 'works', { slug: 'bir-is' })).toBe(
      `${PREVIEW_URL}/preview?path=%2Fisler%2Fbir-is`,
    )
  })

  it('opens each single-entry page at its own page', async () => {
    const config = await cmsConfig({ PREVIEW_URL: `${PREVIEW_URL}/` })
    expect(await open(config, 'site')).toBe(`${PREVIEW_URL}/preview?path=%2F`)
    expect(await open(config, 'about')).toBe(`${PREVIEW_URL}/preview?path=%2Fhakkimda`)
    expect(await open(config, 'privacy')).toBe(`${PREVIEW_URL}/preview?path=%2Fgizlilik`)
  })

  it('has nothing to open for a Work without a slug yet', async () => {
    const config = await cmsConfig({ PREVIEW_URL })
    expect(await open(config, 'works', {})).toBeNull()
  })

  it('is not shown when no preview instance is configured', async () => {
    const config = await cmsConfig()
    for (const slug of ['works', 'site', 'about', 'privacy']) {
      expect(previewButton(config, slug), slug).toBeUndefined()
    }
  })

  it('refuses a preview address that is not an http(s) URL', () => {
    for (const value of ['preview.tail1234.ts.net', 'javascript:alert(1)']) {
      expect(() => siteConfigOptionsFromEnv('cms', { ...baseEnv, PREVIEW_URL: value })).toThrow(
        /PREVIEW_URL/,
      )
    }
  })
})

const baseEnv = { DATABASE_PATH: 'x.db', PAYLOAD_SECRET: 's' }
