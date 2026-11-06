import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { User, Work } from './payload-types'
import { createTestSite, type TestSite } from './testing'

// Seam 1 (spec #1): an Editor deletes an Image or Video in the admin (issue #20). Media that a
// Work or page uses must be refused with a Turkish message, never a raw database error; media
// that only old versions used can go.

let site: TestSite
let editor: User

beforeAll(async () => {
  site = await createTestSite()
  editor = await site.createEditor()
}, 60_000)

afterAll(async () => {
  await site?.close()
})

beforeEach(() => {
  site.revalidations.length = 0
})

const asEditor = { user: undefined as unknown as User, overrideAccess: false } as const
const as = () => ({ ...asEditor, user: editor })

const image = async () => (await site.uploadImage(editor)).id

let works = 0
/** Saves a new Work as the admin does; cover and main image default to fresh Images. */
async function createWork(status: 'draft' | 'published', extra: Partial<Work> = {}): Promise<Work> {
  const n = ++works
  const cover = await image()
  return site.cms.create({
    collection: 'works',
    data: {
      title: `Silme işi ${n}`,
      slug: `silme-isi-${n}`,
      disciplines: ['kurgu'],
      year: 2025,
      cover,
      mainMedia: { kind: 'image', image: await image() },
      ...extra,
      _status: status,
    },
    draft: status === 'draft',
    ...as(),
  })
}

const publishPage = (slug: 'site' | 'about', data: Record<string, unknown>) =>
  site.cms.updateGlobal({ slug, data: { ...data, _status: 'published' }, ...as() })

/** The refusal an Editor would see, or null when the delete went through. */
async function refusal(collection: 'images' | 'videos', id: number): Promise<string | null> {
  try {
    await site.cms.delete({ collection, id, ...as() })
    return null
  } catch (error) {
    return (error as Error).message
  }
}

const stillThere = async (collection: 'images' | 'videos', id: number) =>
  Boolean(await site.cms.findByID({ collection, id, depth: 0 }).catch(() => null))

describe('deleting an Image that something uses', () => {
  const cases: [string, (id: number) => Promise<unknown>][] = [
    ['a Work cover', (id) => createWork('published', { cover: id })],
    ['a Work SEO image', (id) => createWork('published', { seo: { image: id } })],
    [
      'a Work main image',
      (id) => createWork('published', { mainMedia: { kind: 'image', image: id } }),
    ],
    [
      'an external main media poster',
      (id) =>
        createWork('published', {
          mainMedia: {
            kind: 'external',
            externalUrl: 'https://youtu.be/dQw4w9WgXcQ',
            externalPoster: id,
          },
        }),
    ],
    ['a Work still', (id) => createWork('published', { stills: [{ image: id }] })],
    ['the Site showreel poster', (id) => publishPage('site', { showreelPoster: id })],
    ['the About portrait', (id) => publishPage('about', { portrait: id })],
  ]

  it.each(cases)('is refused when it is %s, naming where, and nothing changes', async (_n, use) => {
    const media = await site.uploadImage(editor)
    await use(media.id)
    site.revalidations.length = 0
    const objects = site.s3.objects.size

    const message = await refusal('images', media.id)

    expect(message).toMatch(/Bu görsel kullanıldığı için silinemez/)
    expect(message).not.toMatch(/Failed query|SQLITE|constraint/i)
    expect(await stillThere('images', media.id)).toBe(true)
    expect(site.s3.objects.size).toBe(objects)
    expect(site.revalidations).toEqual([])
  })

  it('names the Work that uses it', async () => {
    const cover = await image()
    await createWork('published', { title: 'Mavi Saat', cover })
    expect(await refusal('images', cover)).toMatch(/“Mavi Saat” işi/)
  })

  it('is refused when it is the poster of a Video, so the Video keeps its required poster', async () => {
    const poster = await image()
    const video = await site.uploadVideo(editor, { use: 'previewLoop', poster })

    const message = await refusal('images', poster)

    expect(message).toMatch(/Bu görsel kullanıldığı için silinemez/)
    expect(message).toContain(video.filename as string)
    expect(await stillThere('images', poster)).toBe(true)
    const kept = await site.cms.findByID({ collection: 'videos', id: video.id, depth: 0 })
    expect(kept.poster).toBe(poster)
  })
})

describe('deleting a Video that something uses', () => {
  const cases: [string, (id: number) => Promise<unknown>, 'previewLoop' | 'main' | 'showreel'][] = [
    ['a preview loop', (id) => createWork('published', { previewLoop: id }), 'previewLoop'],
    [
      'a main video',
      (id) => createWork('published', { mainMedia: { kind: 'video', video: id } }),
      'main',
    ],
    ['the Site showreel', (id) => publishPage('site', { showreel: id }), 'showreel'],
  ]

  it.each(cases)(
    'is refused when it is %s, naming where, and nothing changes',
    async (_n, use, kind) => {
      const media = await site.uploadVideo(editor, { use: kind })
      await use(media.id)
      site.revalidations.length = 0

      const message = await refusal('videos', media.id)

      expect(message).toMatch(/Bu video kullanıldığı için silinemez/)
      expect(message).not.toMatch(/Failed query|SQLITE|constraint/i)
      expect(await stillThere('videos', media.id)).toBe(true)
      expect(site.revalidations).toEqual([])
    },
  )
})

describe('deleting media in the other states', () => {
  it('is refused when only a draft of a Work uses it', async () => {
    const work = await createWork('published')
    const draftCover = await image()
    await site.cms.update({
      collection: 'works',
      id: work.id,
      data: { cover: draftCover, _status: 'draft' },
      draft: true,
      ...as(),
    })

    expect(await refusal('images', draftCover)).toMatch(/Bu görsel kullanıldığı için silinemez/)
    expect(await stillThere('images', draftCover)).toBe(true)
  })

  it('goes through when nothing uses it, moving every object to trash/', async () => {
    const unused = await site.uploadImage(editor)
    const keys = [
      unused.filename,
      ...Object.values(unused.sizes ?? {}).map((s) => s?.filename),
    ].filter((k): k is string => Boolean(k))

    expect(await refusal('images', unused.id)).toBeNull()

    expect(await stillThere('images', unused.id)).toBe(false)
    for (const key of keys) {
      expect(site.s3.objects.has(key), `${key} left live`).toBe(false)
      expect(site.s3.objects.has(`trash/${key}`), `trash/${key}`).toBe(true)
    }
    expect(site.revalidations).toEqual([])
  })

  it('goes through when only an old stored version used it, leaving the Work as it is now', async () => {
    const old = await image()
    const next = await image()
    const work = await createWork('published', { cover: old })
    await site.cms.update({
      collection: 'works',
      id: work.id,
      data: { cover: next, _status: 'published' },
      ...as(),
    })
    site.revalidations.length = 0

    expect(await refusal('images', old)).toBeNull()

    expect(await stillThere('images', old)).toBe(false)
    const now = await site.cms.findByID({
      collection: 'works',
      id: work.id,
      draft: false,
      depth: 0,
    })
    expect(now.cover).toBe(next)
    expect(site.revalidations).toEqual([])
  })
})
