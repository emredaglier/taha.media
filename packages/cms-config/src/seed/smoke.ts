import type { Payload } from 'payload'

import { richTextToPlainText } from '../rich-text'

/**
 * What the release-gate smoke spec expects to find on the site (spec #1, Seam 2): written to a
 * JSON file by `prepareSmokeContent` and read by the browser spec, so the spec never restates the
 * demo seed. Plain JSON only.
 */
export type SmokeManifest = {
  /** Every published Work, under the slug the site serves it at. */
  works: { slug: string; title: string; featured: boolean }[]
  /** A Work that was never published: 404 on the public site, shown by the preview instance. */
  draft: { slug: string; title: string }
  /** A published Work whose slug changed: `oldSlug` must redirect to `newSlug`. */
  renamed: { oldSlug: string; newSlug: string; title: string }
  /** A featured Work that `applyLiveEdit` retitles after the site has cached its pages. */
  liveEdit: { slug: string; title: string; newTitle: string }
  /** The start of the first paragraph of the About and Privacy pages. */
  about: { text: string }
  privacy: { text: string }
}

type Block = { children?: unknown[] }
const firstBlockText = (value: unknown, length: number): string => {
  const root = (value as { root?: Block } | null | undefined)?.root
  const first = root?.children?.[0]
  return richTextToPlainText({ root: { children: first ? [first] : [] } }).slice(0, length)
}

/**
 * Adds to a seeded local database (`seedLocal`) what only the smoke run needs, through the Local
 * API like the admin: a never-published Work and a renamed one. Run it once on a fresh seed.
 */
export async function prepareSmokeContent(payload: Payload): Promise<SmokeManifest> {
  const published = () =>
    payload.find({
      collection: 'works',
      draft: false,
      overrideAccess: false,
      limit: 100,
      depth: 0,
      sort: 'createdAt',
    })

  const before = (await published()).docs
  const toRename = before.find((work) => !work.featured)
  const liveEdit = before.find((work) => work.featured)
  if (!toRename || !liveEdit) {
    throw new Error('The smoke needs a featured and a non-featured published Work in the seed.')
  }

  const oldSlug = toRename.slug as string
  const newSlug = `${oldSlug}-yeni`
  await payload.update({
    collection: 'works',
    id: toRename.id,
    data: { slug: newSlug, _status: 'published' },
  })

  const draft = await payload.create({
    collection: 'works',
    draft: true,
    data: { title: 'Taslak Çalışma', year: 2026, disciplines: ['kurgu'], _status: 'draft' },
  })

  const works = (await published()).docs.map((work) => ({
    slug: work.slug as string,
    title: work.title,
    featured: Boolean(work.featured),
  }))

  const [about, privacy] = await Promise.all([
    payload.findGlobal({ slug: 'about', draft: false, overrideAccess: false }),
    payload.findGlobal({ slug: 'privacy', draft: false, overrideAccess: false }),
  ])

  return {
    works,
    draft: { slug: draft.slug as string, title: draft.title },
    renamed: { oldSlug, newSlug, title: toRename.title },
    liveEdit: {
      slug: liveEdit.slug as string,
      title: liveEdit.title,
      newTitle: `${liveEdit.title} (canlı düzenleme)`,
    },
    about: { text: firstBlockText(about.bio, 40) },
    privacy: { text: firstBlockText(privacy.body, 25) },
  }
}

/**
 * The live edit: retitles and publishes the manifest's featured Work. The site is already running
 * with its pages cached, so the new title can only show up if the publish reached `web`'s
 * revalidate route (ADR-0012).
 */
export async function applyLiveEdit(payload: Payload, manifest: SmokeManifest): Promise<void> {
  const { docs } = await payload.find({
    collection: 'works',
    where: { slug: { equals: manifest.liveEdit.slug } },
    draft: false,
    overrideAccess: false,
    limit: 1,
    depth: 0,
  })
  const work = docs[0]
  if (!work) throw new Error(`Live-edit Work ${manifest.liveEdit.slug} not found.`)
  await payload.update({
    collection: 'works',
    id: work.id,
    data: { title: manifest.liveEdit.newTitle, _status: 'published' },
  })
}
