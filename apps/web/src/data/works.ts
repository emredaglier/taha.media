import type { Discipline, WorkDoc } from '@taha/cms-config'

import { getWebPayload } from '../lib/payload'

/** A published Work as the site renders it (GLOSSARY: Work). */
export type Work = {
  id: number
  title: string
  slug: string
  disciplines: Discipline[]
  year: number
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
})

/** Every published Work. */
export async function getWorks(): Promise<Work[]> {
  const payload = await getWebPayload()
  const { docs } = await payload.find({ ...PUBLISHED_WORKS, limit: 0, pagination: false })
  return docs.map(toWork)
}

/**
 * What a Work URL leads to: the Work, a permanent redirect to its current slug (the frontend
 * answers 301), or nothing.
 */
export type WorkBySlug =
  { kind: 'work'; work: Work } | { kind: 'redirect'; slug: string } | { kind: 'notFound' }

/**
 * Resolves a slug from the URL. A current slug wins over an old one; an old slug redirects to the
 * Work's current slug only while that Work is published. A draft or unknown slug is not found.
 */
export async function getWorkBySlug(slug: string): Promise<WorkBySlug> {
  const payload = await getWebPayload()
  const current = await payload.find({
    ...PUBLISHED_WORKS,
    where: { slug: { equals: slug } },
    limit: 1,
    pagination: false,
  })
  if (current.docs[0]) return { kind: 'work', work: toWork(current.docs[0]) }

  const renamed = await payload.find({
    ...PUBLISHED_WORKS,
    where: { previousSlugs: { equals: slug } },
    sort: '-updatedAt',
    limit: 1,
    pagination: false,
  })
  return renamed.docs[0] ? { kind: 'redirect', slug: renamed.docs[0].slug } : { kind: 'notFound' }
}

/** The current slug of every published Work, for static params. */
export async function getPublishedWorkSlugs(): Promise<string[]> {
  const payload = await getWebPayload()
  const { docs } = await payload.find({
    ...PUBLISHED_WORKS,
    select: { slug: true },
    limit: 0,
    pagination: false,
  })
  return docs.map((doc) => doc.slug)
}
