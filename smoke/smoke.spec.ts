import {
  expect,
  test as base,
  type APIRequest,
  type APIResponse,
  type Page,
} from '@playwright/test'

import {
  consoleFailure,
  exposedRouteFailure,
  pageErrorFailure,
  requestFailure,
  responseFailure,
  type Expectation,
} from './failure-rules.ts'
import { loadEverything } from './load-everything.ts'
import { expectedTitle, publicRoutes, readManifest } from './manifest.ts'
import { routeAssets } from './network.ts'

// The release gate (spec #1, Seam 2; CODING_STANDARDS, "Smoke specs"). It runs against the built
// image, started by smoke/run.ts: `baseUrl` is the public instance behind Caddy, `webUrl` the same
// container directly (the revalidate secret test needs to reach it), `previewUrl` the preview
// instance. What each public route must show comes from the manifest of the seeded database, not
// from constants. What the frontend must provide for this to pass: infra/README.md, "What the
// frontend must provide".
const env = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set. Run through \`pnpm smoke\`.`)
  return value
}
const baseUrl = env('SMOKE_BASE_URL')
const webUrl = env('SMOKE_WEB_URL')
const previewUrl = env('SMOKE_PREVIEW_URL')
const revalidateSecret = env('SMOKE_REVALIDATE_SECRET')
const assetPrefix = env('SMOKE_ASSET_PREFIX')
const manifest = readManifest(env('SMOKE_MANIFEST'))

/** Text as React writes it into server HTML. */
const asHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')

const UNKNOWN_PATH = '/bu/sayfa/yok'
const draftPath = `/isler/${manifest.draft.slug}`

type Visit = (path: string, status?: number) => Promise<string[]>

const test = base.extend<{ visit: Visit }>({
  // Requests may only go to the public instance, the asset prefix (answered by the instance) and
  // the seeded media. Anything else fails, so a stray external request cannot hide in CI.
  context: async ({ context }, provide) => {
    await routeAssets(context)
    await provide(context)
  },

  /** Opens a page in the browser and returns everything that went wrong while it loaded. */
  visit: async ({ page }, provide) => {
    await provide(async (path, status = 200) => {
      const failures: string[] = []
      const expected: Expectation = { url: new URL(path, baseUrl).toString(), status }
      page.on('console', (message) => {
        const failure = consoleFailure(
          { type: message.type(), text: message.text(), location: message.location().url },
          expected,
        )
        if (failure) failures.push(failure)
      })
      page.on('pageerror', (error) => failures.push(pageErrorFailure(error)))
      page.on('requestfailed', (request) => {
        const failure = requestFailure({
          url: request.url(),
          reason: request.failure()?.errorText,
        })
        if (failure) failures.push(failure)
      })
      page.on('response', (response) => {
        const request = response.request()
        const failure = responseFailure(
          {
            url: response.url(),
            status: response.status(),
            isDocument: request.isNavigationRequest() && request.frame() === page.mainFrame(),
          },
          expected,
        )
        if (failure) failures.push(failure)
      })

      const response = await page.goto(path, { waitUntil: 'load' })
      expect(response?.status(), `status of ${path}`).toBe(status)
      await loadEverything(page)
      failures.push(...(await brokenImages(page)))
      return failures
    })
  },
})

/** Images that did not decode (the 4xx case is caught by the response rule as well). */
async function brokenImages(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    // Lazy images the page never scrolled near are not complete. Load them now, then judge.
    await Promise.all(
      [...document.images]
        .filter((img) => img.currentSrc && !img.complete)
        .map((img) => {
          img.loading = 'eager'
          return Promise.race([
            img.decode().catch(() => {}),
            new Promise((resolve) => setTimeout(resolve, 5_000)),
          ])
        }),
    )
    return [...document.images]
      .filter((img) => img.currentSrc && (!img.complete || img.naturalWidth === 0))
      .map((img) => `broken image: ${img.currentSrc}`)
  })
}

const setCookies = (response: APIResponse) =>
  response
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value)

/**
 * Enters draft preview on the preview instance from a throwaway request context (so no other
 * request picks the cookies up by itself) and returns the response and its cookies as a header.
 */
async function enterPreview(api: APIRequest, path: string) {
  const context = await api.newContext()
  try {
    const response = await context.get(`${previewUrl}/preview?path=${encodeURIComponent(path)}`, {
      maxRedirects: 0,
    })
    const cookie = setCookies(response)
      .map((c) => c.split(';')[0])
      .join('; ')
    return { status: response.status(), headers: response.headers(), cookie }
  } finally {
    await context.dispose()
  }
}

test.describe('public routes', () => {
  for (const route of publicRoutes(manifest)) {
    test(`${route.path} loads with its content, no console error and no 404`, async ({
      page,
      request,
      visit,
    }) => {
      const failures = await visit(route.path)
      const main = page.locator('main').first()
      await expect(main).toBeVisible()
      for (const title of route.featuredTitles ?? []) await expect(main).toContainText(title)
      if (route.text) await expect(main).toContainText(route.text)
      if (route.path.startsWith('/isler/')) {
        await expect(page.locator('h1').first()).toContainText(route.text ?? '')
      }
      expect(failures).toEqual([])

      // The server HTML already holds the content: the pages are prerendered (ADR-0012), and
      // nothing is hidden until JavaScript hydrates.
      const html = await (await request.get(route.path)).text()
      for (const title of route.featuredTitles ?? []) expect(html).toContain(asHtml(title))
      if (route.text) expect(html).toContain(asHtml(route.text))
    })
  }

  test('Home links every Featured Work to its page', async ({ request }) => {
    const html = await (await request.get('/')).text()
    for (const work of manifest.works.filter((w) => w.featured)) {
      expect(html, work.slug).toContain(`href="/isler/${work.slug}"`)
    }
  })

  test('no draft is on the public site', async ({ request }) => {
    for (const route of ['/', '/isler']) {
      const response = await request.get(route)
      if (response.status() === 200)
        expect(await response.text()).not.toContain(manifest.draft.title)
    }
  })
})

test.describe('redirects and not-found', () => {
  test('a Work under its old slug redirects permanently to the new one', async ({ request }) => {
    const response = await request.get(`/isler/${manifest.renamed.oldSlug}`, { maxRedirects: 0 })
    expect([301, 308]).toContain(response.status())
    expect(new URL(response.headers().location ?? '', baseUrl).pathname).toBe(
      `/isler/${manifest.renamed.newSlug}`,
    )
    const target = await request.get(`/isler/${manifest.renamed.newSlug}`)
    expect(target.status()).toBe(200)
    expect(await target.text()).toContain(asHtml(manifest.renamed.title))
  })

  test('a Work that was never published is a 404', async ({ page, request, visit }) => {
    const failures = await visit(draftPath, 404)
    expect(await page.locator('body').innerText()).not.toBe('')
    expect(failures).toEqual([])
    const html = await (await request.get(draftPath)).text()
    expect(html).not.toContain(asHtml(manifest.draft.title))
  })

  test('an unknown Work slug is a 404', async ({ request }) => {
    expect((await request.get('/isler/yok-boyle-bir-is', { maxRedirects: 0 })).status()).toBe(404)
  })

  test('an unknown path shows the not-found page, with content and without JavaScript', async ({
    page,
    request,
    visit,
  }) => {
    const failures = await visit(UNKNOWN_PATH, 404)
    expect((await page.locator('body').innerText()).trim()).not.toBe('')
    expect(failures).toEqual([])
    // Next.js can send an empty body for a not-found page when the layout is wrong.
    const response = await request.get(UNKNOWN_PATH, { maxRedirects: 0 })
    expect(response.status()).toBe(404)
    expect(await response.text()).toMatch(/<h1\b/)
  })
})

test.describe('routes and headers', () => {
  const exposed = [
    '/admin',
    '/admin/login',
    '/api',
    '/api/users',
    '/api/works',
    '/api/globals/site',
    '/api/graphql',
    '/api/images/file/anything.webp',
    '/internal/health',
    '/internal/revalidate',
    '/preview',
    `/preview?path=${draftPath}`,
  ]

  test('the public instance has no admin, API, internal or preview route', async ({ request }) => {
    const failures: string[] = []
    for (const route of exposed) {
      const response = await request.get(route, { maxRedirects: 0, failOnStatusCode: false })
      const failure = exposedRouteFailure(route, response.status())
      if (failure) failures.push(failure)
    }
    expect(failures).toEqual([])
  })

  test('Caddy refuses the revalidate route even with the right secret', async ({ request }) => {
    const response = await request.post('/internal/revalidate', {
      headers: { 'x-revalidate-secret': revalidateSecret },
      data: { tags: ['page:site'] },
    })
    expect(exposedRouteFailure('POST /internal/revalidate', response.status())).toBeUndefined()
  })

  test('web itself has no admin or API route either (not only Caddy hides them)', async ({
    request,
  }) => {
    const failures: string[] = []
    for (const route of ['/admin', '/admin/login', '/api', '/api/users', '/api/graphql']) {
      const response = await request.get(`${webUrl}${route}`, { maxRedirects: 0 })
      const failure = exposedRouteFailure(`web ${route}`, response.status())
      if (failure) failures.push(failure)
    }
    expect(failures).toEqual([])
  })

  test('the revalidate route needs the shared secret', async ({ request }) => {
    const post = (headers: Record<string, string>) =>
      request.post(`${webUrl}/internal/revalidate`, { headers, data: { tags: ['page:site'] } })
    expect((await post({})).status()).toBe(401)
    expect((await post({ 'x-revalidate-secret': 'nope' })).status()).toBe(401)
    expect((await post({ 'x-revalidate-secret': revalidateSecret })).status()).toBe(200)
  })

  test('no route sets a cookie', async ({ request }) => {
    const routes = [
      ...publicRoutes(manifest).map((route) => route.path),
      UNKNOWN_PATH,
      draftPath,
      '/admin',
    ]
    for (const route of routes) {
      expect(setCookies(await request.get(route)), route).toEqual([])
    }
  })

  test('the public instance is not noindex', async ({ request }) => {
    for (const route of ['/', `/isler/${manifest.works[0]?.slug}`]) {
      const response = await request.get(route)
      expect(response.headers()['x-robots-tag'], route).toBeUndefined()
      expect(await response.text(), route).not.toMatch(/<meta[^>]+name="robots"[^>]+noindex/i)
    }
  })

  test('scripts, styles and fonts come from the CDN prefix, with the deployment id', async ({
    request,
  }) => {
    const html = await (await request.get('/')).text()
    const urls = [...html.matchAll(/(?:src|href)="([^"]*_next\/static[^"]*)"/g)].map((m) => m[1]!)
    expect(urls.length, 'no /_next/static asset found on Home').toBeGreaterThan(3)
    for (const url of urls) {
      expect(url.startsWith(`${assetPrefix}/_next/static/`), url).toBe(true)
      expect(url, url).toContain('?dpl=')
    }
  })
})

// ADR-0001: one image, two instances. Only the preview instance (PREVIEW=1) ever shows a draft.
test.describe('draft preview', () => {
  test('the public instance ignores preview cookies, even a genuine one', async ({
    request,
    playwright,
  }) => {
    const forged = { cookie: '__prerender_bypass=forged; __next_preview_data=forged' }
    expect((await request.get(draftPath, { headers: forged })).status()).toBe(404)

    // A genuine cookie from the preview instance carries the same build's bypass id.
    const { cookie } = await enterPreview(playwright.request, draftPath)
    expect(cookie).toContain('__prerender_bypass')
    expect((await request.get(draftPath, { headers: { cookie } })).status()).toBe(404)
  })

  test('the preview instance shows the draft once preview is entered, noindex', async ({
    request,
    playwright,
  }) => {
    const { status, headers, cookie } = await enterPreview(playwright.request, draftPath)
    expect(status).toBe(307)
    expect(new URL(headers.location ?? '', previewUrl).pathname).toBe(draftPath)
    expect(headers['x-robots-tag']).toMatch(/noindex/)

    const draft = await request.get(`${previewUrl}${draftPath}`, { headers: { cookie } })
    expect(draft.status()).toBe(200)
    expect(draft.headers()['x-robots-tag']).toMatch(/noindex/)
    const html = await draft.text()
    expect(html).toContain(asHtml(manifest.draft.title))
    expect(html).toMatch(/<meta[^>]+name="robots"[^>]+noindex/i)
  })

  test('every preview page is noindex, and the entry route refuses an off-site path', async ({
    request,
  }) => {
    const work = manifest.works[0]!
    for (const route of ['/', `/isler/${work.slug}`, '/hakkimda']) {
      const response = await request.get(`${previewUrl}${route}`)
      expect(response.headers()['x-robots-tag'], route).toMatch(/noindex/)
    }
    // An open redirect would send the visitor off-site.
    const evil = await request.get(`${previewUrl}/preview?path=//evil.example`, { maxRedirects: 0 })
    expect(evil.status()).toBe(400)
  })
})

// smoke/run.ts saved this through the Local API after warming the cache, so only the revalidate
// call can have brought it to the pages (apps/cms/scripts/smoke-live-edit.ts).
test.describe('live edit', () => {
  test('a retitled Featured Work shows on Home and on its own page', async ({ request }) => {
    const work = manifest.works.find((w) => w.slug === manifest.liveEdit.slug)!
    const title = asHtml(expectedTitle(manifest, work))
    expect(title).not.toBe(asHtml(manifest.liveEdit.title))
    expect(await (await request.get('/')).text()).toContain(title)
    expect(await (await request.get(`/isler/${work.slug}`)).text()).toContain(title)
  })
})
