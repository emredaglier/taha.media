import {
  DISCIPLINES,
  resolveSeo,
  toImage,
  toMainMedia,
  toVideo,
  type MainMedia,
  type Discipline,
  type ImageDoc,
  type ImageRead,
  type VideoDoc,
  type VideoRead,
  type Seo,
  type WorkDoc,
} from '@taha/cms-config'
import { HOME_TAG, WORKS_TAG, workTag } from '@taha/cms-config/tags'

import { getWebPayload } from '../lib/payload'
import { isPreviewInstance } from '../lib/preview'
import { cachedRead, contentVersions } from './cache'
import { richText } from './pages'

/**
 * A published Work as the site renders it (GLOSSARY: Work); on the preview instance, its latest
 * draft.
 */
export type Work = {
  id: number
  title: string
  slug: string
  disciplines: Discipline[]
  year: number
  /** Required to publish, so every published Work has one. */
  cover: ImageRead
  /** Exactly one, by kind; required to publish, so every published Work has one. */
  mainMedia: MainMedia
  /** The optional silent loop cards play; null when the Work has none. */
  previewLoop: VideoRead | null
  featured: boolean
  featuredOrder: number | null
  client: string | null
  role: string | null
  /** In the order the Editor set. */
  credits: { name: string; role: string | null }[]
  /**
   * Rich text (paragraphs, bold, italic, links) as a Lexical editor state, or null when empty.
   * The frontend renders it.
   */
  description: NonNullable<WorkDoc['description']> | null
  /** Optional stills, in order, with a srcset each. */
  stills: ImageRead[]
  /** Overrides when set, otherwise the title, the start of the description and the cover. */
  seo: Seo<ImageRead>
}

/**
 * What every Works read shares: published versions on the public instance, the latest drafts on
 * the preview instance (`contentVersions`).
 */
const worksRead = () =>
  ({
    collection: 'works',
    ...contentVersions(),
    // Depth 2 populates the cover Image and the preview loop with its poster.
    depth: 2,
  }) as const

function toCover(cover: WorkDoc['cover']): ImageRead {
  // A published Work always has a populated cover (required on publish, populated by depth 1).
  if (typeof cover !== 'object' || cover === null) throw new Error('A published Work has no cover.')
  return toImage(cover as ImageDoc)
}

/** Populated Images only: an id (not populated) cannot be rendered, so it is skipped. */
const stillImages = (value: number | ImageDoc | null | undefined): ImageRead[] =>
  typeof value === 'object' && value !== null ? [toImage(value)] : []

function toPreviewLoop(video: WorkDoc['previewLoop']): VideoRead | null {
  return typeof video === 'object' && video !== null ? toVideo(video as VideoDoc) : null
}

const toWork = (doc: WorkDoc): Work => {
  const cover = toCover(doc.cover)
  return {
    cover,
    mainMedia: toMainMedia(doc.mainMedia),
    previewLoop: toPreviewLoop(doc.previewLoop),
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
    disciplines: doc.disciplines,
    year: doc.year,
    featured: doc.featured ?? false,
    featuredOrder: doc.featuredOrder ?? null,
    client: doc.client || null,
    role: doc.role || null,
    credits: (doc.credits ?? []).map(({ name, role }) => ({ name, role: role || null })),
    description: richText(doc.description),
    stills: (doc.stills ?? []).flatMap(({ image }) => stillImages(image)),
    seo: resolveSeo({
      overrides: doc.seo,
      title: doc.title,
      description: doc.description,
      fallbackImage: cover,
      toImage,
    }),
  }
}

/**
 * A draft may still lack what publishing requires (a cover, complete main media), so the preview
 * instance leaves such a Work out instead of failing the whole page. A published Work always has
 * them, so on the public instance a missing one is a real error and still throws.
 */
function toWorks(docs: WorkDoc[]): Work[] {
  if (!isPreviewInstance()) return docs.map(toWork)
  return docs.flatMap((doc) => {
    try {
      return [toWork(doc)]
    } catch {
      return []
    }
  })
}

/**
 * The Works list order: Works with a drag position first, by position; the rest (no position
 * yet) after them, year descending, then creation date descending.
 */
function listOrder(a: WorkDoc, b: WorkDoc): number {
  if (a._order && b._order) return a._order < b._order ? -1 : a._order > b._order ? 1 : 0
  if (a._order) return -1
  if (b._order) return 1
  return b.year - a.year || Date.parse(b.createdAt) - Date.parse(a.createdAt)
}

/**
 * Published Works in list order. With a Discipline, only the Works that have it (the
 * `?disiplin=` filter); an unknown Discipline throws, so a bad URL value is never silently
 * ignored.
 */
export async function getWorks(options: { discipline?: Discipline } = {}): Promise<Work[]> {
  const { discipline } = options
  if (discipline !== undefined && !DISCIPLINES.includes(discipline)) {
    throw new Error(
      `Unknown Discipline "${String(discipline)}" (expected ${DISCIPLINES.join(' | ')}).`,
    )
  }
  return cachedRead(['works', discipline ?? 'all'], [WORKS_TAG], async () => {
    const payload = await getWebPayload()
    const { docs } = await payload.find({
      ...worksRead(),
      ...(discipline ? { where: { disciplines: { contains: discipline } } } : {}),
      limit: 0,
      pagination: false,
    })
    return toWorks(docs.sort(listOrder))
  })
}

/** Published Featured Works by featured order (Home); those without a place come last. */
export function getFeaturedWorks(): Promise<Work[]> {
  return cachedRead(['featured-works'], [HOME_TAG], async () => {
    const payload = await getWebPayload()
    const { docs } = await payload.find({
      ...worksRead(),
      where: { featured: { equals: true } },
      limit: 0,
      pagination: false,
    })
    const sorted = docs.sort(
      (a, b) => (a.featuredOrder ?? Infinity) - (b.featuredOrder ?? Infinity) || listOrder(a, b),
    )
    return toWorks(sorted)
  })
}

/**
 * What a Work URL leads to: the Work, a permanent redirect to its current slug (the frontend
 * answers 301), or nothing.
 */
export type WorkBySlug =
  { kind: 'work'; work: Work } | { kind: 'redirect'; slug: string } | { kind: 'notFound' }

/** What a slug points at, before the Work itself is read. */
type SlugLookup = { kind: 'work'; id: number } | Exclude<WorkBySlug, { kind: 'work' }>

/**
 * Resolves a slug from the URL. A current slug wins over an old one; an old slug redirects to the
 * Work's current slug only while that Work is published. A draft or unknown slug is not found.
 * On the preview instance, drafts count as published (their latest version).
 *
 * Two cached steps: the slug lookup sits under the Works list tag (every Work change touches it,
 * so a rename, publish or unpublish re-resolves it), and the Work itself under its own id tag.
 */
export async function getWorkBySlug(slug: string): Promise<WorkBySlug> {
  const found = await lookUpSlug(slug)
  if (found.kind !== 'work') return found
  const work = await getPublishedWork(found.id)
  return work ? { kind: 'work', work } : { kind: 'notFound' }
}

/**
 * The current slug of the Work a renamed slug used to name, or null for any other slug (current,
 * draft or unknown). Only the slug lookup, the same cached step as `getWorkBySlug`: the proxy
 * answers the redirect itself (src/proxy.ts).
 */
export async function getRenamedWorkSlug(slug: string): Promise<string | null> {
  const found = await lookUpSlug(slug)
  return found.kind === 'redirect' ? found.slug : null
}

function lookUpSlug(slug: string): Promise<SlugLookup> {
  return cachedRead(['work-slug', slug], [WORKS_TAG], async () => {
    const payload = await getWebPayload()
    const current = await payload.find({
      ...worksRead(),
      where: { slug: { equals: slug } },
      depth: 0,
      select: { slug: true },
      limit: 1,
      pagination: false,
    })
    if (current.docs[0]) return { kind: 'work', id: current.docs[0].id }

    const renamed = await payload.find({
      ...worksRead(),
      where: { previousSlugs: { equals: slug } },
      depth: 0,
      select: { slug: true },
      sort: '-updatedAt',
      limit: 1,
      pagination: false,
    })
    return renamed.docs[0] ? { kind: 'redirect', slug: renamed.docs[0].slug } : { kind: 'notFound' }
  })
}

/** One published Work (preview: latest draft) by id, or null; tagged with the Work's own tag. */
function getPublishedWork(id: number): Promise<Work | null> {
  return cachedRead(['work', String(id)], [workTag(id)], async () => {
    const payload = await getWebPayload()
    const { docs } = await payload.find({
      ...worksRead(),
      where: { id: { equals: id } },
      limit: 1,
      pagination: false,
    })
    return toWorks(docs)[0] ?? null
  })
}

/**
 * The current slug of every published Work, for static params. The preview instance (which never
 * builds) lists draft slugs too.
 */
export function getPublishedWorkSlugs(): Promise<string[]> {
  return cachedRead(['work-slugs'], [WORKS_TAG], async () => {
    const payload = await getWebPayload()
    const { docs } = await payload.find({
      ...worksRead(),
      select: { slug: true },
      limit: 0,
      pagination: false,
    })
    return docs.map((doc) => doc.slug)
  })
}
