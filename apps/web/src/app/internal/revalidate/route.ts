import { createHash, timingSafeEqual } from 'node:crypto'

import { MAX_TAGS_PER_REQUEST, REVALIDATE_SECRET_HEADER, TAG_PATTERN } from '@taha/cms-config/tags'
import { revalidateTag } from 'next/cache'

/**
 * `cms` POSTs `{ tags }` here after a publish, unpublish or delete (ADR-0012), and the next
 * request for a page that read those tags renders it fresh.
 *
 * Internal only: `cms` reaches it over the internal Docker network (`http://web:3000/...`), and
 * Caddy must not route `/internal/*` from the public internet (ADR-0001; Caddy config is #15).
 * The shared secret (`REVALIDATE_SECRET`, same value on `cms` and `web`) is the second lock.
 */
export async function POST(request: Request): Promise<Response> {
  if (
    !secretMatches(request.headers.get(REVALIDATE_SECRET_HEADER), process.env.REVALIDATE_SECRET)
  ) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  let tags: unknown
  try {
    tags = ((await request.json()) as { tags?: unknown }).tags
  } catch {
    return Response.json({ error: 'invalid body' }, { status: 400 })
  }
  if (
    !Array.isArray(tags) ||
    tags.length === 0 ||
    tags.length > MAX_TAGS_PER_REQUEST ||
    !tags.every((tag) => typeof tag === 'string' && TAG_PATTERN.test(tag))
  ) {
    return Response.json({ error: 'invalid tags' }, { status: 400 })
  }

  // `expire: 0`: the next request reads fresh data instead of being served the stale copy once.
  for (const tag of tags as string[]) revalidateTag(tag, { expire: 0 })
  return Response.json({ revalidated: tags })
}

/**
 * Constant-time comparison of the presented secret with the configured one. Both are hashed
 * first, so the comparison never depends on the input's length. An unset secret never matches.
 */
function secretMatches(presented: string | null, expected: string | undefined): boolean {
  if (!expected || !presented) return false
  const a = createHash('sha256').update(presented).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}
