import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { User, Work } from './payload-types'
import { HOME_TAG, MAX_TAGS_PER_REQUEST, WORKS_TAG, pageTag, workTag } from './tags'
import { createTestSite, type TestSite } from './testing'

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

/** Each notification as a sorted tag list: the assertions are about the set, not the order. */
const sent = () => site.revalidations.map((tags) => [...tags].sort())
const tagSet = (...tags: string[]) => [...tags].sort()

const as = { user: () => editor, overrideAccess: false } as const

const image = async () => (await site.uploadImage(editor)).id

let works = 0
/** Saves a new Work as the admin does; the cover and main image default to fresh Images. */
async function createWork(status: 'draft' | 'published', extra: Partial<Work> = {}): Promise<Work> {
  const n = ++works
  const cover = await image()
  return site.cms.create({
    collection: 'works',
    data: {
      title: `İş ${n}`,
      slug: `medya-is-${n}`,
      disciplines: ['kurgu'],
      year: 2025,
      cover,
      mainMedia: { kind: 'image', image: cover },
      ...extra,
      _status: status,
    },
    draft: status === 'draft',
    user: as.user(),
    overrideAccess: as.overrideAccess,
  })
}

/** Edits an Image's alt text as an Editor would. */
const editAlt = (id: number, alt = 'Yeni alternatif metin') =>
  site.cms.update({ collection: 'images', id, data: { alt }, ...asUser() })

const asUser = () => ({ user: as.user(), overrideAccess: as.overrideAccess })

describe('editing an Image', () => {
  it('touches each published Work using it as cover, and the Works list', async () => {
    const cover = await image()
    const a = await createWork('published', { cover })
    const b = await createWork('published', { cover })
    site.revalidations.length = 0

    await editAlt(cover)

    expect(sent()).toEqual([tagSet(workTag(a.id), workTag(b.id), WORKS_TAG)])
  })

  it('touches Home too when one of those Works is featured', async () => {
    const cover = await image()
    const featured = await createWork('published', { cover, featured: true, featuredOrder: 1 })
    site.revalidations.length = 0

    await editAlt(cover)

    expect(sent()).toEqual([tagSet(workTag(featured.id), WORKS_TAG, HOME_TAG)])
  })

  it('also counts a focal point change', async () => {
    const cover = await image()
    const work = await createWork('published', { cover })
    site.revalidations.length = 0

    await site.cms.update({
      collection: 'images',
      id: cover,
      data: { focalX: 20, focalY: 80 },
      ...asUser(),
    })

    expect(sent()).toEqual([tagSet(workTag(work.id), WORKS_TAG)])
  })

  it.each([
    ['the main image', (id: number) => ({ mainMedia: { kind: 'image' as const, image: id } })],
    [
      'the external poster',
      (id: number) => ({
        mainMedia: {
          kind: 'external' as const,
          externalUrl: 'https://vimeo.com/76979871',
          externalPoster: id,
        },
      }),
    ],
    ['a still', (id: number) => ({ stills: [{ image: id }] })],
    ['the SEO share image', (id: number) => ({ seo: { image: id } })],
  ])('finds a published Work using it as %s', async (_, uses) => {
    const used = await image()
    const work = await createWork('published', uses(used))
    site.revalidations.length = 0

    await editAlt(used)

    expect(sent()).toEqual([tagSet(workTag(work.id), WORKS_TAG)])
  })

  it('finds a published Work through a Video it is the poster of', async () => {
    const poster = await image()
    const loop = await site.uploadVideo(editor, { use: 'previewLoop', poster })
    const work = await createWork('published', { previewLoop: loop.id })
    site.revalidations.length = 0

    await editAlt(poster)

    expect(sent()).toEqual([tagSet(workTag(work.id), WORKS_TAG)])
  })

  it('sends nothing when only drafts use it', async () => {
    const used = await image()
    await createWork('draft', { cover: used })
    const published = await createWork('published')
    await site.cms.update({
      collection: 'works',
      id: published.id,
      data: { cover: used, _status: 'draft' },
      draft: true,
      ...asUser(),
    })
    site.revalidations.length = 0

    await editAlt(used)

    expect(sent()).toEqual([])
  })

  it('sends nothing when nothing uses it, nor for a new upload', async () => {
    const unused = await image()
    await editAlt(unused)
    expect(sent()).toEqual([])
  })
})

// Media that a Work or page uses can't be deleted at all (media-delete.int.test.ts, issue #20):
// the refusal sends nothing, and media only old versions used changes nothing visitors see. So
// no delete reaches a published page, and the only delete left to assert here is an unused one.
describe('deleting an Image', () => {
  it('sends nothing when nothing used it', async () => {
    const unused = await image()
    await site.cms.delete({ collection: 'images', id: unused, ...asUser() })
    expect(sent()).toEqual([])
  })
})

describe('a Video', () => {
  it('replacing its poster touches the published Works showing it', async () => {
    const loop = await site.uploadVideo(editor, { use: 'previewLoop' })
    const work = await createWork('published', {
      previewLoop: loop.id,
      featured: true,
      featuredOrder: 2,
    })
    site.revalidations.length = 0

    await site.cms.update({
      collection: 'videos',
      id: loop.id,
      data: { poster: await image() },
      ...asUser(),
    })

    expect(sent()).toEqual([tagSet(workTag(work.id), WORKS_TAG, HOME_TAG)])
  })
})

type Page = 'site' | 'about' | 'privacy'

/** Publishes a single-entry page with the given fields. */
const publishPage = (slug: Page, data: Record<string, unknown>) =>
  site.cms.updateGlobal({ slug, data: { ...data, _status: 'published' }, ...asUser() })

describe('a single-entry page using the media', () => {
  it.each([
    ['site', 'the Showreel image', (id: number) => ({ showreelPoster: id })],
    ['about', 'the portrait', (id: number) => ({ portrait: id })],
    ['about', 'a client logo', (id: number) => ({ clients: [{ name: 'Marka', logo: id }] })],
    ['privacy', 'the SEO share image', (id: number) => ({ seo: { image: id } })],
  ] as const)('%s is touched when it shows the Image as %s', async (slug, _, uses) => {
    const used = await image()
    await publishPage(slug, uses(used))
    site.revalidations.length = 0

    await editAlt(used)

    expect(sent()).toEqual([[pageTag(slug)]])
  })

  it('site is touched when its Showreel Video gets a new poster', async () => {
    const showreel = await site.uploadVideo(editor, { use: 'showreel' })
    await publishPage('site', { showreel: showreel.id })
    site.revalidations.length = 0

    await site.cms.update({
      collection: 'videos',
      id: showreel.id,
      data: { poster: await image() },
      ...asUser(),
    })

    expect(sent()).toEqual([[pageTag('site')]])
  })

  it('a page using it only in a draft is not touched', async () => {
    await publishPage('about', {})
    const used = await image()
    await site.cms.updateGlobal({
      slug: 'about',
      data: { portrait: used, _status: 'draft' },
      draft: true,
      ...asUser(),
    })
    site.revalidations.length = 0

    await editAlt(used)

    expect(sent()).toEqual([])
  })
})

describe('a failed notification', () => {
  it("is logged and does not block the Editor's media edit", async () => {
    const failing = await createTestSite({
      revalidate: () => Promise.reject(new Error('connect ECONNREFUSED web:3000')),
    })
    try {
      const error = vi.spyOn(failing.cms.logger, 'error')
      const user = await failing.createEditor()
      const cover = (await failing.uploadImage(user)).id
      await failing.cms.create({
        collection: 'works',
        data: {
          title: 'Yayında',
          slug: 'yayinda',
          disciplines: ['grafik'],
          year: 2024,
          cover,
          mainMedia: { kind: 'image', image: cover },
          _status: 'published',
        },
        user,
        overrideAccess: false,
      })

      const edited = await failing.cms.update({
        collection: 'images',
        id: cover,
        data: { alt: 'Kayıt yine de' },
        user,
        overrideAccess: false,
      })

      expect(edited.alt).toBe('Kayıt yine de')
      expect(error).toHaveBeenLastCalledWith(
        expect.objectContaining({ msg: expect.stringContaining('ECONNREFUSED') }),
      )
    } finally {
      await failing.close()
    }
  }, 60_000)
})

describe('many Works using one Image', () => {
  it(`goes out in batches web accepts (at most ${MAX_TAGS_PER_REQUEST} tags each)`, async () => {
    const cover = await image()
    const many: Work[] = []
    for (let i = 0; i < MAX_TAGS_PER_REQUEST; i++)
      many.push(await createWork('published', { cover }))
    site.revalidations.length = 0

    await editAlt(cover)

    expect(site.revalidations.every((tags) => tags.length <= MAX_TAGS_PER_REQUEST)).toBe(true)
    expect(site.revalidations.flat().sort()).toEqual(
      tagSet(...many.map((work) => workTag(work.id)), WORKS_TAG),
    )
  }, 60_000)
})
