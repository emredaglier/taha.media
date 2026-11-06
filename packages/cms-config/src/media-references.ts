import type { Field, PayloadRequest } from 'payload'

import type { PageSlug } from './tags'

export type MediaCollection = 'images' | 'videos'

export const PAGE_SLUGS: readonly PageSlug[] = ['site', 'about', 'privacy']

/** The single-entry pages as the admin names them. */
const PAGE_LABELS: Record<PageSlug, string> = {
  site: 'Site',
  about: 'Hakkımda',
  privacy: 'Gizlilik',
}

/**
 * Dotted paths (`cover`, `mainMedia.video`, `stills.image`, `seo.image`) of every field that
 * references a document of `target`. Read from the config, so a new upload field is covered
 * without touching this module. Rich text holds no uploads (rich-text.ts), and nothing uses blocks
 * or polymorphic relationships, so neither is walked.
 */
export function referencePaths(fields: Field[], target: MediaCollection, prefix = ''): string[] {
  return fields.flatMap((field): string[] => {
    if (field.type === 'upload' || field.type === 'relationship') {
      return field.relationTo === target ? [`${prefix}${field.name}`] : []
    }
    if (field.type === 'tabs') {
      return field.tabs.flatMap((tab) =>
        referencePaths(
          tab.fields,
          target,
          'name' in tab && tab.name ? `${prefix}${tab.name}.` : prefix,
        ),
      )
    }
    if ('fields' in field) {
      const named = 'name' in field && field.name ? `${prefix}${field.name}.` : prefix
      return referencePaths(field.fields, target, named)
    }
    return []
  })
}

/** Media to look for: documents of one collection, by id. */
export type MediaRefs = { target: MediaCollection; ids: (number | string)[] }[]

type Row = Record<string, unknown>

const idOf = (value: unknown): unknown =>
  typeof value === 'object' && value !== null ? (value as { id: unknown }).id : value

/** Every id stored at a dotted path, walking through arrays (`clients.logo`). */
function idsAt(value: unknown, path: string[]): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => idsAt(item, path))
  if (path.length === 0) {
    const id = idOf(value)
    return id === null || id === undefined ? [] : [String(id)]
  }
  if (typeof value !== 'object' || value === null) return []
  const [head, ...rest] = path
  return idsAt((value as Row)[head as string], rest)
}

const worksFields = (req: PayloadRequest): Field[] => req.payload.collections.works.config.fields

const globalFields = (req: PayloadRequest, slug: PageSlug): Field[] =>
  req.payload.config.globals.find((global) => global.slug === slug)?.fields ?? []

/** A `where` matching documents that reference any of the media, or null when nothing can. */
function referencingWhere(fields: Field[], refs: MediaRefs) {
  const or = refs.flatMap(({ target, ids }) =>
    ids.length === 0 ? [] : referencePaths(fields, target).map((path) => ({ [path]: { in: ids } })),
  )
  return or.length === 0 ? null : { or }
}

/** Whether a page document (depth 0) references any of the media. */
function pageReferences(req: PayloadRequest, slug: PageSlug, doc: Row, refs: MediaRefs): boolean {
  return refs.some(({ target, ids }) => {
    const wanted = new Set(ids.map(String))
    return referencePaths(globalFields(req, slug), target).some((path) =>
      idsAt(doc, path.split('.')).some((id) => wanted.has(id)),
    )
  })
}

/**
 * What visitors see that uses the media: the published Works (their main rows, so a reference held
 * only in a draft does not count) and the published single-entry pages.
 */
export async function publishedReferences(
  req: PayloadRequest,
  refs: MediaRefs,
): Promise<{ works: { id: number | string; featured: boolean }[]; pages: PageSlug[] }> {
  const where = referencingWhere(worksFields(req), refs)
  const works = where
    ? (
        await req.payload.find({
          collection: 'works',
          where: { and: [{ _status: { equals: 'published' } }, where] },
          select: { featured: true },
          depth: 0,
          pagination: false,
          overrideAccess: true,
          req,
        })
      ).docs.map((doc) => ({ id: doc.id, featured: Boolean(doc.featured) }))
    : []
  const pages: PageSlug[] = []
  for (const slug of PAGE_SLUGS) {
    // The main row is what visitors see; a draft save goes to the versions table only.
    const main = (await req.payload.db.findGlobal({ slug, req })) as Row | null
    if (main?._status === 'published' && pageReferences(req, slug, main, refs)) pages.push(slug)
  }
  return { works, pages }
}

/**
 * Everything that references the media in any state: each Work's main row and its latest draft,
 * and each page's main row and latest draft. Returns Turkish labels for the Editor.
 */
export async function anyReferences(req: PayloadRequest, refs: MediaRefs): Promise<string[]> {
  const labels = new Set<string>()
  const where = referencingWhere(worksFields(req), refs)
  if (where) {
    for (const draft of [false, true]) {
      const { docs } = await req.payload.find({
        collection: 'works',
        where,
        draft,
        select: { title: true },
        depth: 0,
        pagination: false,
        overrideAccess: true,
        req,
      })
      for (const doc of docs) labels.add(`“${doc.title}” işi`)
    }
  }
  for (const slug of PAGE_SLUGS) {
    for (const draft of [false, true]) {
      const doc = await req.payload.findGlobal({
        slug,
        draft,
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (pageReferences(req, slug, doc as unknown as Row, refs)) {
        labels.add(`${PAGE_LABELS[slug]} sayfası`)
      }
    }
  }
  return [...labels]
}
