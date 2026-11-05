import { unstable_cache } from 'next/cache'

import { isPreviewInstance } from '../lib/preview'

/**
 * Which versions every read sees. The public instance reads published versions only, with the
 * access rules applied (the Local API skips them by default; with no user, the read rules only
 * match published documents), and `draft: false` reads the published version even when a newer
 * draft exists. The preview instance reads the latest version of everything, drafts and
 * never-published documents included; with no user, that needs the access rules bypassed.
 *
 * Decided by the instance alone (`PREVIEW=1`, read once at startup), never by a request.
 */
export const contentVersions = () =>
  isPreviewInstance()
    ? ({ draft: true, overrideAccess: true } as const)
    : ({ draft: false, overrideAccess: false } as const)

/**
 * Runs a data-module read through Next's data cache, tagged with the tags `cms` sends when that
 * content changes (`@taha/cms-config/tags`, ADR-0012). There is no time-based revalidation: an
 * entry lives until one of its tags is revalidated through `/internal/revalidate`.
 *
 * `key` must name the read and every argument it closes over (Next keys the entry by it), and the
 * result must be plain JSON (the cache serialises it).
 *
 * The preview instance never caches: it renders on every request, so a saved draft shows at once.
 */
export function cachedRead<R>(key: string[], tags: string[], read: () => Promise<R>): Promise<R> {
  if (isPreviewInstance()) return read()
  return unstable_cache(read, key, { tags, revalidate: false })()
}
