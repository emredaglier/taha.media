import { NextResponse, type NextRequest } from 'next/server'

import { getRenamedWorkSlug } from './data/works'
import { isPreviewInstance, PREVIEW_ROBOTS } from './lib/preview'

/** `/isler/<slug>` and nothing deeper. */
const WORK_PATH = /^\/isler\/([^/]+)\/?$/

/**
 * Where a request for a renamed Work's old address should go, or null to let it through. Never
 * throws: a malformed address names no Work, and a failed lookup lets the request through to the
 * Work page's own redirect. That fallback is the one with the duplicate `Location`, so a failed
 * lookup is logged.
 */
async function renamedWorkPath(pathname: string): Promise<string | null> {
  const match = WORK_PATH.exec(pathname)
  if (!match) return null
  let slug: string
  try {
    slug = decodeURIComponent(match[1]!)
  } catch {
    return null
  }
  try {
    const current = await getRenamedWorkSlug(slug)
    return current ? `/isler/${encodeURIComponent(current)}` : null
  } catch (error) {
    console.error(`proxy: old-slug lookup failed for ${pathname}; the Work page redirects`, error)
    return null
  }
}

/**
 * Runs on every request, at runtime, so one build serves both instances:
 *  - a renamed Work's old address answers 301 to the current one here, before any page renders.
 *    A `permanentRedirect` in the cached Work page sends `Location` twice on the render that fills
 *    the cache: Next sets the header on the response and records it in the cache entry, then
 *    appends the recorded headers to the same response (Next 16.3.8, unchanged in 16.4.5 and the
 *    16.5 canary; #61);
 *  - the preview instance (`PREVIEW=1`) tells crawlers to stay away on every response,
 *    prerendered pages included (a `next.config` header would be fixed at build time, when
 *    PREVIEW is never set).
 *
 * Nothing in the request decides the preview header: only the instance's environment does.
 *
 * The frontend may add its own routing here; keep the preview header on every response.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const target = await renamedWorkPath(request.nextUrl.pathname)
  const response = target
    ? NextResponse.redirect(new URL(target + request.nextUrl.search, request.url), 301)
    : NextResponse.next()
  if (isPreviewInstance()) response.headers.set('x-robots-tag', PREVIEW_ROBOTS)
  return response
}

export const config = { matcher: '/((?!_next/static|_next/image).*)' }
