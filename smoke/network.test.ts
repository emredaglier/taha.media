import type { BrowserContext, Route } from '@playwright/test'
import { afterEach, describe, expect, it } from 'vitest'

import { assetTarget, mediaFile, routeAssets } from './network.ts'

const config = {
  baseUrl: 'http://127.0.0.1:32768',
  assetPrefix: 'https://cdn.taha.media/releases/abc1234',
}

describe('assetTarget', () => {
  it('lets the public instance through', () => {
    expect(assetTarget('http://127.0.0.1:32768/hakkimda', config)).toEqual({ kind: 'continue' })
  })

  it('answers CDN-prefixed /_next/ files from the instance', () => {
    expect(
      assetTarget('https://cdn.taha.media/releases/abc1234/_next/static/chunks/a.js?dpl=x', config),
    ).toEqual({ kind: 'rewrite', url: 'http://127.0.0.1:32768/_next/static/chunks/a.js' })
  })

  it('answers seeded media paths from the seed folders instead of the instance', () => {
    expect(
      assetTarget('http://127.0.0.1:32768/api/images/file/demo-1-medium.webp', config),
    ).toEqual({ kind: 'media', collection: 'images', name: 'demo-1-medium.webp' })
    expect(assetTarget('http://127.0.0.1:32768/api/videos/file/demo-main-3.mp4', config)).toEqual({
      kind: 'media',
      collection: 'videos',
      name: 'demo-main-3.mp4',
    })
  })

  it('does not special-case other /api paths: they reach the instance and must 404 there', () => {
    expect(assetTarget('http://127.0.0.1:32768/api/users', config)).toEqual({ kind: 'continue' })
  })

  it('aborts CDN requests that are not /_next/ files and every other origin', () => {
    expect(assetTarget('https://cdn.taha.media/releases/abc1234/logo.svg', config)).toEqual({
      kind: 'abort',
    })
    expect(assetTarget('https://example.com/x.js', config)).toEqual({ kind: 'abort' })
  })

  it('aborts the CDN when the image was built without a prefix', () => {
    expect(
      assetTarget('https://cdn.taha.media/_next/a.js', { ...config, assetPrefix: undefined }),
    ).toEqual({ kind: 'abort' })
  })
})

describe('mediaFile', () => {
  it('maps a seeded name to its file and content type', () => {
    expect(mediaFile('/data', { collection: 'images', name: 'a.webp' })).toEqual({
      file: '/data/images/a.webp',
      type: 'image/webp',
    })
    expect(mediaFile('/data', { collection: 'videos', name: 'a.mp4' })?.type).toBe('video/mp4')
  })

  it('refuses a name that leaves the folder', () => {
    expect(mediaFile('/data', { collection: 'images', name: '../taha.db' })).toBeNull()
  })
})

describe('routeAssets', () => {
  const env = { ...process.env }
  afterEach(() => {
    process.env = { ...env }
  })

  // A context that hands back the route handler, and a route for a CDN-prefixed file.
  const setup = async (fulfill: () => Promise<void>) => {
    process.env['SMOKE_BASE_URL'] = config.baseUrl
    process.env['SMOKE_MEDIA_DIR'] = '/data'
    process.env['SMOKE_ASSET_PREFIX'] = config.assetPrefix
    let handler: (route: Route) => Promise<void> = async () => {}
    const context = {
      route: async (_pattern: RegExp, fn: typeof handler) => {
        handler = fn
      },
    } as unknown as BrowserContext
    await routeAssets(context)
    const route = {
      request: () => ({ url: () => `${config.assetPrefix}/_next/static/a.js` }),
      fetch: async () => ({ headers: () => ({}) }),
      fulfill,
      abort: async () => {},
      continue: async () => {},
    } as unknown as Route
    return () => handler(route)
  }

  it('does not fail a test when the page closes while a file is being fetched', async () => {
    const run = await setup(() =>
      Promise.reject(new Error('route.fulfill: Fetch response has been disposed')),
    )
    await expect(run()).resolves.toBeUndefined()
  })

  it('still reports any other error', async () => {
    const run = await setup(() => Promise.reject(new Error('something else broke')))
    await expect(run()).rejects.toThrow('something else broke')
  })
})
