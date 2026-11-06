/**
 * An in-memory stand-in for `next/cache`, installed for every test by `next-cache-setup.ts`.
 * Outside a running Next server, `unstable_cache` throws ("incrementalCache missing"), so tests
 * of the data module and the revalidate route need this; no test starts Next (CLAUDE.md).
 *
 * Caching is off by default, so a read runs every time, as most data tests expect. A test that
 * checks revalidation turns it on: reads are then cached by key and arguments until one of their
 * tags is revalidated, as Next does.
 */

type Entry = { json: string; tags: string[] }

const entries = new Map<string, Entry>()

export const nextCache = {
  caching: false,
  /** Every `revalidateTag` call, in order. */
  revalidated: [] as { tag: string; profile: unknown }[],
  /** Empties the cache and the record, and turns caching off again. */
  reset(): void {
    entries.clear()
    nextCache.revalidated.length = 0
    nextCache.caching = false
  },
}

export function unstable_cache<A extends unknown[], R>(
  read: (...args: A) => Promise<R>,
  keyParts: readonly string[] = [],
  options: { tags?: string[]; revalidate?: number | false } = {},
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    if (!nextCache.caching) return read(...args)
    const key = JSON.stringify([keyParts, args])
    const hit = entries.get(key)
    // Like Next, a cached value is serialised: a read must return plain JSON.
    if (hit) return JSON.parse(hit.json) as R
    const value = await read(...args)
    entries.set(key, { json: JSON.stringify(value), tags: options.tags ?? [] })
    return value
  }
}

export function revalidateTag(tag: string, profile?: unknown): void {
  nextCache.revalidated.push({ tag, profile })
  for (const [key, entry] of entries) if (entry.tags.includes(tag)) entries.delete(key)
}
