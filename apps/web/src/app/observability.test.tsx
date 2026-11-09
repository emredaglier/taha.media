import { prerender } from 'react-dom/static'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The root layout as an instance sees it: the environment is read when the layout renders (and
 * `PREVIEW` once, when the preview module loads), so each case loads a fresh copy.
 */
async function layoutHtml(env: { production: boolean; preview: boolean; token?: string }) {
  vi.resetModules()
  vi.stubEnv('NODE_ENV', env.production ? 'production' : 'development')
  vi.stubEnv('PREVIEW', env.preview ? '1' : '')
  vi.stubEnv('NEXT_PUBLIC_CLOUDFLARE_BEACON_TOKEN', env.token ?? '')
  const { default: RootLayout } = await import('./layout')
  const { prelude } = await prerender(
    <RootLayout>
      <p>içerik</p>
    </RootLayout>,
  )
  return new Response(prelude).text()
}

afterEach(() => vi.unstubAllEnvs())

describe('the Cloudflare Web Analytics beacon in the page HTML', () => {
  it('is an explicit deferred script with the token, in production', async () => {
    const html = await layoutHtml({ production: true, preview: false, token: 'abc123' })
    expect(html).toMatch(
      /<script[^>]*src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js"/,
    )
    expect(html).toContain('data-cf-beacon="{&quot;token&quot;:&quot;abc123&quot;}"')
    expect(html).toMatch(/<script[^>]*defer/)
  })

  it('is absent without a token', async () => {
    const html = await layoutHtml({ production: true, preview: false })
    expect(html).not.toContain('cloudflareinsights')
  })

  it('is absent outside production', async () => {
    const html = await layoutHtml({ production: false, preview: false, token: 'abc123' })
    expect(html).not.toContain('cloudflareinsights')
  })

  it('is absent on the preview instance, even in production with a token', async () => {
    const html = await layoutHtml({ production: true, preview: true, token: 'abc123' })
    expect(html).not.toContain('cloudflareinsights')
  })
})
