import { createTestSite, type TestSite } from '@taha/cms-config/testing'
import { NextRequest } from 'next/server'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

/** Loads the proxy the way an instance starts: with or without PREVIEW=1 in its environment. */
async function startInstance(preview: boolean) {
  vi.resetModules()
  vi.stubEnv('PREVIEW', preview ? '1' : '')
  const { proxy } = await import('./proxy')
  return (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
    proxy(new NextRequest(new URL(path, 'http://site.test'), init))
}

afterEach(() => vi.unstubAllEnvs())

describe('robots on the preview instance', () => {
  it('marks every preview response noindex, nofollow', async () => {
    const run = await startInstance(true)
    for (const path of ['/', '/isler', '/isler/bir-is', '/hakkimda', '/gizlilik', '/preview']) {
      expect((await run(path)).headers.get('x-robots-tag')).toBe('noindex, nofollow')
    }
  })

  it('marks nothing on the public instance, whatever the request asks for', async () => {
    const run = await startInstance(false)
    const response = await run('/?preview=1&draft=true', {
      headers: {
        'x-preview': '1',
        cookie: '__prerender_bypass=anything; __next_preview_data=anything; preview=1',
      },
    })
    expect(response.headers.get('x-robots-tag')).toBeNull()
  })
})

// #61: the Work page's own `permanentRedirect` sent `Location` twice on the render that filled the
// cache (a Next bug no unit test can start). The proxy answers instead, before any page renders.
describe('a renamed Work', () => {
  let site: TestSite

  beforeAll(async () => {
    site = await createTestSite()
    Object.assign(process.env, site.webEnv)
    const editor = await site.createEditor()
    const cover = await site.uploadImage(editor, { alt: 'Kapak' })
    const as = { user: editor, overrideAccess: false } as const
    const work = await site.cms.create({
      collection: 'works',
      data: {
        title: 'Eski Ad',
        slug: 'eski-ad',
        disciplines: ['kurgu'],
        year: 2025,
        cover: cover.id,
        mainMedia: { kind: 'image', image: cover.id },
        _status: 'published',
      },
      ...as,
    })
    await site.cms.update({
      collection: 'works',
      id: work.id,
      data: { slug: 'yeni-ad', generateSlug: false, _status: 'published' },
      ...as,
    })
  }, 60_000)

  afterAll(async () => {
    await site?.close()
  })

  it('answers its old address with one permanent redirect to the current one', async () => {
    const run = await startInstance(false)
    const response = await run('/isler/eski-ad?ref=eski')
    expect(response.status).toBe(301)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname + location.search).toBe('/isler/yeni-ad?ref=eski')
  })

  it('redirects on the preview instance too, still noindex', async () => {
    const run = await startInstance(true)
    const response = await run('/isler/eski-ad')
    expect(response.status).toBe(301)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/isler/yeni-ad')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })

  it('lets the current address, an unknown slug and every other path through to the pages', async () => {
    const run = await startInstance(false)
    for (const path of ['/isler/yeni-ad', '/isler/yok-boyle', '/isler/%E0%A4%A', '/isler', '/']) {
      const response = await run(path)
      expect(response.headers.get('location'), path).toBeNull()
      expect(response.headers.get('x-middleware-next'), path).toBe('1')
    }
  })
})
