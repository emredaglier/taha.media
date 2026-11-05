import { unstable_cache } from 'next/cache'

/** True in the preview container (ADR-0001), the same image as `web` started with `PREVIEW=1`. */
export const isPreviewInstance = (): boolean => process.env.PREVIEW === '1'

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
