import {
  DISCIPLINES,
  resolveSeo,
  richTextToPlainText,
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
import { cachedRead } from './cache'

/** A published Work as the site renders it (GLOSSARY: Work). */
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
 * What every public Works read shares: published versions only, with the access rules applied
 * (the Local API skips them by default; with no user, the Works read rule only matches published
 * documents). `draft: false` reads the published version even when a newer draft exists.
 */
const PUBLISHED_WORKS = {
  collection: 'works',
  draft: false,
  overrideAccess: false,
  // Depth 2 populates the cover Image and the preview loop with its poster.
  depth: 2,
} as const

function toCover(cover: WorkDoc['cover']): ImageRead {
  // A published Work always has a populated cover (required on publish, populated by depth 1).
  if (typeof cover !== 'object' || cover === null) throw new Error('A published Work has no cover.')
  return toImage(cover as ImageDoc)
}

/** Populated Images only: an id (not populated) cannot be rendered, so it is skipped. */
const populated = (value: number | ImageDoc | null | undefined): ImageRead[] =>
  typeof value === 'object' && value !== null ? [toImage(value)] : []

/** The description counts as empty when it has no text at all (an editor state with one blank paragraph). */
const hasText = (description: WorkDoc['description']): boolean =>
  richTextToPlainText(description) !== ''

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
    description: doc.description && hasText(doc.description) ? doc.description : null,
    stills: (doc.stills ?? []).flatMap(({ image }) => populated(image)),
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
      ...PUBLISHED_WORKS,
      ...(discipline ? { where: { disciplines: { contains: discipline } } } : {}),
      limit: 0,
      pagination: false,
    })
    return docs.sort(listOrder).map(toWork)
  })
}

/** Published Featured Works by featured order (Home); those without a place come last. */
export function getFeaturedWorks(): Promise<Work[]> {
  return cachedRead(['featured-works'], [HOME_TAG], async () => {
    const payload = await getWebPayload()
    const { docs } = await payload.find({
      ...PUBLISHED_WORKS,
      where: { featured: { equals: true } },
      limit: 0,
      pagination: false,
    })
    return docs
      .sort(
        (a, b) => (a.featuredOrder ?? Infinity) - (b.featuredOrder ?? Infinity) || listOrder(a, b),
      )
      .map(toWork)
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

function lookUpSlug(slug: string): Promise<SlugLookup> {
  return cachedRead(['work-slug', slug], [WORKS_TAG], async () => {
    const payload = await getWebPayload()
    const current = await payload.find({
      ...PUBLISHED_WORKS,
      where: { slug: { equals: slug } },
      depth: 0,
      select: { slug: true },
      limit: 1,
      pagination: false,
    })
    if (current.docs[0]) return { kind: 'work', id: current.docs[0].id }

    const renamed = await payload.find({
      ...PUBLISHED_WORKS,
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

/** One published Work by id, or null; tagged with the Work's own tag. */
function getPublishedWork(id: number): Promise<Work | null> {
  return cachedRead(['work', String(id)], [workTag(id)], async () => {
    const payload = await getWebPayload()
    const { docs } = await payload.find({
      ...PUBLISHED_WORKS,
      where: { id: { equals: id } },
      limit: 1,
      pagination: false,
    })
    return docs[0] ? toWork(docs[0]) : null
  })
}

/** The current slug of every published Work, for static params. */
export function getPublishedWorkSlugs(): Promise<string[]> {
  return cachedRead(['work-slugs'], [WORKS_TAG], async () => {
    const payload = await getWebPayload()
    const { docs } = await payload.find({
      ...PUBLISHED_WORKS,
      select: { slug: true },
      limit: 0,
      pagination: false,
    })
    return docs.map((doc) => doc.slug)
  })
}
