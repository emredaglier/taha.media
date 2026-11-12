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

/** A relationship value is an id, or a populated document with one. */
export const idOf = (value: unknown): unknown =>
  typeof value === 'object' && value !== null ? (value as { id: unknown }).id : value

export const isSet = (value: unknown): boolean =>
  value !== null && value !== undefined && value !== ''

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

const galleryFields = (req: PayloadRequest): Field[] =>
  req.payload.collections.gallery.config.fields

type GalleryItemRef = { id: number | string; caption?: string | null }

/**
 * The Gallery items that use any of the media. Items have no drafts, so what is stored is what
 * visitors see.
 */
async function galleryItemsUsing(req: PayloadRequest, refs: MediaRefs): Promise<GalleryItemRef[]> {
  const where = referencingWhere(galleryFields(req), refs)
  if (!where) return []
  const { docs } = await req.payload.find({
    collection: 'gallery',
    where,
    select: { caption: true },
    // The Gallery's own order, so a refusal lists the items the way the Editor sees them.
    sort: '_order',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return docs
}

/** How the Editor knows a Gallery item: by its caption, or by its number when it has none. */
const galleryItemLabel = ({ id, caption }: GalleryItemRef) =>
  caption?.trim() ? `“${caption.trim()}” galeri öğesi` : `Galeri öğesi #${id}`

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
 * only in a draft does not count), the published single-entry pages, and whether any Gallery item
 * uses it.
 */
export async function publishedReferences(
  req: PayloadRequest,
  refs: MediaRefs,
): Promise<{
  works: { id: number | string; featured: boolean }[]
  pages: PageSlug[]
  /** Whether any Gallery item uses the media. */
  usedByGallery: boolean
}> {
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
  return { works, pages, usedByGallery: (await galleryItemsUsing(req, refs)).length > 0 }
}

/**
 * Everything that references the media in any state: each Work's main row and its latest draft,
 * each page's main row and latest draft, and each Gallery item. Returns Turkish labels for the
 * Editor.
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
  for (const item of await galleryItemsUsing(req, refs)) labels.add(galleryItemLabel(item))
  return [...labels]
}
