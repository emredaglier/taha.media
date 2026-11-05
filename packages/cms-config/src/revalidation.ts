import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
  GlobalAfterChangeHook,
  GlobalBeforeChangeHook,
  PayloadRequest,
} from 'payload'

import {
  HOME_TAG,
  REVALIDATE_SECRET_HEADER,
  WORKS_TAG,
  pageTag,
  workTag,
  type PageSlug,
} from './tags'

/**
 * Delivers a set of cache tags to `web`. Throws when the delivery failed; the notifier catches it.
 * Production uses `httpRevalidationTransport`; tests pass one that records the tags.
 */
export type RevalidationTransport = (tags: string[]) => Promise<void>

export const DEFAULT_REVALIDATE_TIMEOUT_MS = 2000

export type HttpRevalidationOptions = {
  /** The `web` instance's internal revalidate route, e.g. `http://web:3000/internal/revalidate`. */
  url: string
  /** Shared with `web` (`REVALIDATE_SECRET`). */
  secret: string
  /** A slow or dead `web` must not hold up the Editor's save for long. */
  timeoutMs?: number
  fetch?: typeof fetch
}

/** POSTs `{ tags }` with the shared secret to `web`'s internal revalidate route. */
export function httpRevalidationTransport(options: HttpRevalidationOptions): RevalidationTransport {
  const fetchImpl = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_REVALIDATE_TIMEOUT_MS
  return async (tags) => {
    const response = await fetchImpl(options.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [REVALIDATE_SECRET_HEADER]: options.secret },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) throw new Error(`${options.url} answered ${response.status}`)
  }
}

/**
 * Sends the tags and never throws: a failed notification is logged and the Editor's save goes on.
 * The page then stays stale until the next publish (or a manual POST to the route).
 */
async function notify(
  transport: RevalidationTransport,
  tags: string[],
  req: PayloadRequest,
): Promise<void> {
  try {
    await transport(tags)
  } catch (error) {
    req.payload.logger.error({
      msg: `Revalidation failed for tags ${tags.join(', ')}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    })
  }
}

/** What the public site currently shows of a document: the main (published) row. */
type Published = { featured: boolean } | null

type MainRow = { _status?: string | null; featured?: boolean | null } | null

const asPublished = (row: MainRow): Published =>
  row?._status === 'published' ? { featured: Boolean(row.featured) } : null

/**
 * Payload keeps the published version in the main row and writes a draft save only to the
 * versions table, so the main row is what visitors see. `previousDoc` in `afterChange` is the
 * latest version, which may be a draft, so it can't tell what was published before.
 */
async function readMainWork(req: PayloadRequest, id: number | string): Promise<MainRow> {
  return (await req.payload.db.findOne({
    collection: 'works',
    where: { id: { equals: id } },
    req,
  })) as MainRow
}

/**
 * Published state before each save, per request and document (one request can save several
 * Works, e.g. a drag reorder). Captured in `beforeChange`, before the main row is written.
 */
const before = new WeakMap<PayloadRequest, Map<string, Published>>()

const remember = (req: PayloadRequest, key: string, state: Published) => {
  const states = before.get(req) ?? new Map<string, Published>()
  states.set(key, state)
  before.set(req, states)
}

const recall = (req: PayloadRequest, key: string): Published => {
  const states = before.get(req)
  const state = states?.get(key) ?? null
  states?.delete(key)
  return state
}

/**
 * The tags a Work change touches, or none:
 * - publish (also a re-publish, slug change or reorder of a published Work): the Work and the
 *   Works list, plus Home when the Work is or was featured;
 * - unpublish: the same, judged by what was published;
 * - delete of a published Work: the same;
 * - a draft save (or anything to a never-published Work): nothing, visitors see no change.
 */
function workTags(id: number | string, was: Published, is: Published): string[] {
  if (!was && !is) return []
  const home = Boolean(was?.featured || is?.featured)
  return [workTag(id), WORKS_TAG, ...(home ? [HOME_TAG] : [])]
}

/** Hooks that tell `web` which tags a Work change touched. Draft saves send nothing. */
export function workRevalidationHooks(transport: RevalidationTransport): {
  beforeChange: CollectionBeforeChangeHook
  afterChange: CollectionAfterChangeHook
  afterDelete: CollectionAfterDeleteHook
} {
  return {
    beforeChange: async ({ operation, originalDoc, req, data }) => {
      if (operation === 'update' && originalDoc?.id !== undefined) {
        remember(req, String(originalDoc.id), asPublished(await readMainWork(req, originalDoc.id)))
      }
      return data
    },
    afterChange: async ({ doc, req }) => {
      const was = recall(req, String(doc.id))
      let tags: string[] = []
      if (doc._status === 'published') {
        tags = workTags(doc.id, was, asPublished(doc as MainRow))
      } else if (was && asPublished(await readMainWork(req, doc.id)) === null) {
        // Unpublished. A draft save over a published Work leaves the main row published.
        tags = workTags(doc.id, was, null)
      }
      if (tags.length > 0) await notify(transport, tags, req)
      return doc
    },
    afterDelete: async ({ doc, req }) => {
      const tags = workTags(doc.id, asPublished(doc as MainRow), null)
      if (tags.length > 0) await notify(transport, tags, req)
      return doc
    },
  }
}

/** Hooks that tell `web` a single-entry page changed. Draft saves send nothing. */
export function pageRevalidationHooks(
  slug: PageSlug,
  transport: RevalidationTransport,
): { beforeChange: GlobalBeforeChangeHook; afterChange: GlobalAfterChangeHook } {
  const key = `global:${slug}`
  const readMain = async (req: PayloadRequest) =>
    asPublished((await req.payload.db.findGlobal({ slug, req })) as MainRow)
  return {
    beforeChange: async ({ data, req }) => {
      remember(req, key, await readMain(req))
      return data
    },
    afterChange: async ({ doc, req }) => {
      const was = recall(req, key)
      const changed =
        doc._status === 'published' || (was !== null && (await readMain(req)) === null)
      if (changed) await notify(transport, [pageTag(slug)], req)
      return doc
    },
  }
}
