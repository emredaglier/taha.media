import { DISCIPLINES, type Discipline, type WorkDoc } from '@taha/cms-config'

import { getWebPayload } from '../lib/payload'

/** A published Work as the site renders it (GLOSSARY: Work). */
export type Work = {
  id: number
  title: string
  slug: string
  disciplines: Discipline[]
  year: number
  featured: boolean
  featuredOrder: number | null
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
  depth: 0,
} as const

const toWork = (doc: WorkDoc): Work => ({
  id: doc.id,
  title: doc.title,
  slug: doc.slug,
  disciplines: doc.disciplines,
  year: doc.year,
  featured: doc.featured ?? false,
  featuredOrder: doc.featuredOrder ?? null,
})

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
  const payload = await getWebPayload()
  const { docs } = await payload.find({
    ...PUBLISHED_WORKS,
    ...(discipline ? { where: { disciplines: { contains: discipline } } } : {}),
    limit: 0,
    pagination: false,
  })
  return docs.sort(listOrder).map(toWork)
}

/** Published Featured Works by featured order (Home); those without a place come last. */
export async function getFeaturedWorks(): Promise<Work[]> {
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
}

/** The published Work with this slug, or `null` for an unknown slug or a never-published draft. */
export async function getWorkBySlug(slug: string): Promise<Work | null> {
  const payload = await getWebPayload()
  const { docs } = await payload.find({
    ...PUBLISHED_WORKS,
    where: { slug: { equals: slug } },
    limit: 1,
    pagination: false,
  })
  return docs[0] ? toWork(docs[0]) : null
}
