/**
 * The page-HTML test seam: every page ticket tests through this file.
 *
 * `startPageSite()` builds a temporary CMS (the `createTestSite` helper), points the data module
 * at it, and lets a test publish content and render a route's server output: the async page
 * inside the root layout, as HTML. `renderRoute(url)` reports one of three outcomes: HTML,
 * not-found (the not-found page, status 404) or a redirect with its target.
 *
 * Routes come from the real `app/**\/page.tsx` files, so an unknown path is not-found here for
 * the same reason it is in Next. No test starts Next (CLAUDE.md).
 */
import type { Discipline } from '@taha/cms-config'
import { createTestSite, type TestSite } from '@taha/cms-config/testing'
import type { ComponentType, ReactElement } from 'react'
import { prerender } from 'react-dom/static'

import RootLayout from '../app/layout'
import NotFound from '../app/not-found'

export type RouteOutcome =
  | { kind: 'html'; status: 200; html: string }
  /** `html` is the not-found page inside the layout, as a visitor gets it. */
  | { kind: 'not-found'; status: 404; html: string }
  | { kind: 'redirect'; status: number; permanent: boolean; target: string }

type PageProps = {
  params: Promise<Record<string, string | string[]>>
  searchParams: Promise<Record<string, string | string[]>>
}
type PageModule = { default: ComponentType<PageProps> }

const pageFiles = import.meta.glob('../app/**/page.tsx') as Record<
  string,
  () => Promise<PageModule>
>

/** Routes in the shape `/isler/[slug]`, from the page files' paths; route groups are dropped. */
const routes = Object.entries(pageFiles).map(([file, load]) => {
  const segments = file
    .replace('../app/', '')
    .replace(/\/?page\.tsx$/, '')
    .split('/')
    .filter((segment) => segment !== '' && !/^\(.*\)$/.test(segment))
  return { segments, load }
})

function matchRoute(pathname: string) {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent)
  for (const { segments, load } of routes) {
    if (segments.length !== parts.length) continue
    const params: Record<string, string> = {}
    const matches = segments.every((segment, index) => {
      const dynamic = /^\[(\w+)\]$/.exec(segment)
      if (dynamic) {
        params[dynamic[1]!] = parts[index]!
        return true
      }
      return segment === parts[index]
    })
    if (matches) return { params, load }
  }
  return null
}

const NOT_FOUND_DIGEST = 'NEXT_HTTP_ERROR_FALLBACK;404'

async function toHtml(element: ReactElement): Promise<string> {
  const { prelude } = await prerender(element)
  return new Response(prelude).text()
}

/** Next signals `notFound()` and redirects by throwing errors that carry a digest. */
export function outcomeOfThrown(error: unknown): RouteOutcome | null {
  const digest = (error as { digest?: unknown } | null)?.digest
  if (typeof digest !== 'string') return null
  if (digest === NOT_FOUND_DIGEST) return { kind: 'not-found', status: 404, html: '' }
  const [marker, , target, status] = digest.split(';')
  if (marker !== 'NEXT_REDIRECT' || !target) return null
  const code = Number(status)
  return { kind: 'redirect', status: code, permanent: code === 301 || code === 308, target }
}

const notFoundPage = async (): Promise<RouteOutcome> => ({
  kind: 'not-found',
  status: 404,
  html: await toHtml(
    <RootLayout>
      <NotFound />
    </RootLayout>,
  ),
})

/** Renders the route at `url` (path and optional query) the way a request to Next would. */
export async function renderRoute(url: string): Promise<RouteOutcome> {
  const { pathname, searchParams } = new URL(url, 'http://localhost')
  const route = matchRoute(pathname)
  if (!route) return notFoundPage()

  const query: Record<string, string | string[]> = {}
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key)
    query[key] = values.length === 1 ? values[0]! : values
  }
  const Page = (await route.load()).default
  try {
    const html = await toHtml(
      <RootLayout>
        <Page params={Promise.resolve(route.params)} searchParams={Promise.resolve(query)} />
      </RootLayout>,
    )
    return { kind: 'html', status: 200, html }
  } catch (error) {
    const outcome = outcomeOfThrown(error)
    if (!outcome) throw error
    return outcome.kind === 'not-found' ? notFoundPage() : outcome
  }
}

export type WorkFields = {
  title: string
  slug?: string
  year?: number
  disciplines?: Discipline[]
  /** The id of a Video with use `previewLoop`. */
  previewLoop?: number
}

export type PageSite = {
  site: TestSite
  editor: Awaited<ReturnType<TestSite['createEditor']>>
  /** Publishes (or saves as a draft) a global as the Editor does; its page then renders it. */
  publishGlobal: (
    slug: 'site' | 'about' | 'privacy',
    data: Record<string, unknown>,
    status?: 'draft' | 'published',
  ) => Promise<unknown>
  /**
   * Publishes a Work with a cover and an image as main media. The slug defaults to the title,
   * lower-cased and dashed. Works list in the order they were published.
   */
  publishWork: (fields: WorkFields) => Promise<unknown>
  render: typeof renderRoute
  close: () => Promise<void>
}

/** Call once per test file in `beforeAll`, and `close()` in `afterAll`. */
export async function startPageSite(): Promise<PageSite> {
  const site = await createTestSite()
  Object.assign(process.env, site.webEnv)
  const editor = await site.createEditor()
  let coverId: number | undefined
  return {
    site,
    editor,
    publishGlobal: (slug, data, status = 'published') =>
      site.cms.updateGlobal({
        slug,
        data: { ...data, _status: status } as never,
        draft: status === 'draft',
        user: editor,
        overrideAccess: false,
      }),
    publishWork: async (fields) => {
      coverId ??= (await site.uploadImage(editor, { alt: 'Kapak' })).id
      return site.cms.create({
        collection: 'works',
        data: {
          disciplines: ['kurgu'],
          year: 2025,
          slug: fields.title.toLowerCase().replaceAll(' ', '-'),
          cover: coverId,
          mainMedia: { kind: 'image', image: coverId },
          ...fields,
          _status: 'published',
        },
        user: editor,
        overrideAccess: false,
      })
    },
    render: renderRoute,
    close: () => site.close(),
  }
}
