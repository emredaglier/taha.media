import {
  toImage,
  type Discipline,
  type ImageDoc,
  type ImageRead,
  type WorkDoc,
} from '@taha/cms-config'

import { getWebPayload } from '../lib/payload'

/** A published Work as the site renders it (GLOSSARY: Work). */
export type Work = {
  id: number
  title: string
  slug: string
  disciplines: Discipline[]
  year: number
  /** Required to publish, so every published Work has one. */
  cover: ImageRead
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
  // Depth 1 populates the cover Image.
  depth: 1,
} as const

function toCover(cover: WorkDoc['cover']): ImageRead {
  // A published Work always has a populated cover (required on publish, populated by depth 1).
  if (typeof cover !== 'object' || cover === null) throw new Error('A published Work has no cover.')
  return toImage(cover as ImageDoc)
}

const toWork = (doc: WorkDoc): Work => ({
  cover: toCover(doc.cover),
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
