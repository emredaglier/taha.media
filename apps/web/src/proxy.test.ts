import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
      expect(run(path).headers.get('x-robots-tag')).toBe('noindex, nofollow')
    }
  })

  it('marks nothing on the public instance, whatever the request asks for', async () => {
    const run = await startInstance(false)
    const response = run('/?preview=1&draft=true', {
      headers: {
        'x-preview': '1',
        cookie: '__prerender_bypass=anything; __next_preview_data=anything; preview=1',
      },
    })
    expect(response.headers.get('x-robots-tag')).toBeNull()
  })
})
