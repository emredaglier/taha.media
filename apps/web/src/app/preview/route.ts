import { draftMode } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { isPreviewInstance } from '../../lib/preview'

/**
 * Entry to the draft preview: the admin's preview button links here
 * (`<PREVIEW_URL>/preview?path=/isler/<slug>`, see `@taha/cms-config` `previewLink`). It turns on
 * Next's draft mode, then opens the page.
 *
 * Draft mode is only how the preview instance gets pages rendered on every request: `/`,
 * `/isler/<slug>`, `/hakkimda` and `/gizlilik` are prerendered at build time (ADR-0012), and Next
 * serves that HTML unless the request carries the draft-mode cookie. It never decides what a read
 * returns: drafts come from `PREVIEW=1` alone (`src/data/cache.ts`).
 *
 * The route does not exist (404) on the public instance, so nothing there can mint the cookie.
 * The preview instance is reachable over Tailscale only (ADR-0001), which is the access control.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isPreviewInstance()) notFound()
  const path = sitePath(new URL(request.url).searchParams.get('path'))
  if (!path) return new Response('Invalid path', { status: 400 })
  ;(await draftMode()).enable()
  redirect(path)
}

const ORIGIN = 'http://site.invalid'

/** A path on this site (`/isler/bir-is`), or null for anything that could lead elsewhere. */
function sitePath(value: string | null): string | null {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  const url = new URL(value, ORIGIN)
  return url.origin === ORIGIN ? url.pathname + url.search : null
}
