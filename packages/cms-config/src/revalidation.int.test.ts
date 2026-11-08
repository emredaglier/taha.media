import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { User, Work } from './payload-types'
import { HOME_TAG, WORKS_TAG, pageTag, workTag } from './tags'
import { createTestSite, type TestSite } from './testing'

let site: TestSite
let editor: User
let coverId: number

beforeAll(async () => {
  site = await createTestSite()
  editor = await site.createEditor()
  coverId = (await site.uploadImage(editor)).id
}, 30_000)

afterAll(async () => {
  await site?.close()
})

beforeEach(() => {
  site.revalidations.length = 0
})

/** Each notification as a sorted tag list: the assertions are about the set, not the order. */
const sent = () => site.revalidations.map((tags) => [...tags].sort())
const tagSet = (...tags: string[]) => [...tags].sort()

let works = 0
const as = { user: () => editor, overrideAccess: false } as const

/** Saves a new Work as the admin does: `published` publishes it, otherwise a draft. */
async function createWork(
  status: 'draft' | 'published',
  extra: Partial<Pick<Work, 'featured' | 'featuredOrder'>> = {},
): Promise<Work> {
  const n = ++works
  return site.cms.create({
    collection: 'works',
    data: {
      title: `İş ${n}`,
      slug: `is-${n}`,
      disciplines: ['kurgu'],
      year: 2025,
      cover: coverId,
      mainMedia: { kind: 'image', image: coverId },
      ...extra,
      _status: status,
    },
    draft: status === 'draft',
    user: as.user(),
    overrideAccess: as.overrideAccess,
  })
}

/** Publishes changes to a Work (the admin's "Yayınla"). */
const publish = (id: number, data: Partial<Work> = {}) =>
  site.cms.update({
    collection: 'works',
    id,
    data: { ...data, _status: 'published' },
    user: as.user(),
    overrideAccess: as.overrideAccess,
  })

/** Saves changes as a draft (the admin's "Taslak kaydet"). */
const saveDraft = (id: number, data: Partial<Work> = {}) =>
  site.cms.update({
    collection: 'works',
    id,
    data: { ...data, _status: 'draft' },
    draft: true,
    user: as.user(),
    overrideAccess: as.overrideAccess,
  })

describe('publishing a Work', () => {
  it("touches the Work's tag and the Works list", async () => {
    const work = await createWork('published')
    expect(sent()).toEqual([tagSet(workTag(work.id), WORKS_TAG)])
  })
})

describe('saving a draft', () => {
  it('sends nothing for a new Work', async () => {
    await createWork('draft')
    expect(sent()).toEqual([])
  })

  it('sends nothing over a published Work, even when it changes the slug or featuring', async () => {
    const work = await createWork('published')
    site.revalidations.length = 0
    await saveDraft(work.id, { title: 'Yeni başlık', slug: 'yeni-baslik', featured: true })
    expect(sent()).toEqual([])
  })
})

/** The admin's "Yayından kaldır": the published Work becomes a draft again. */
const unpublish = (id: number) =>
  site.cms.update({
    collection: 'works',
    id,
    data: { _status: 'draft' },
    user: as.user(),
    overrideAccess: as.overrideAccess,
  })

const remove = (id: number) =>
  site.cms.delete({
    collection: 'works',
    id,
    user: as.user(),
    overrideAccess: as.overrideAccess,
  })

/** Creates a Work in the given state, then forgets what that sent. */
async function existing(...args: Parameters<typeof createWork>): Promise<Work> {
  const work = await createWork(...args)
  site.revalidations.length = 0
  return work
}

describe('changing a published Work', () => {
  it('publishing edits touches the Work and the list', async () => {
    const work = await existing('published')
    await publish(work.id, { title: 'Düzeltilmiş' })
    expect(sent()).toEqual([tagSet(workTag(work.id), WORKS_TAG)])
  })

  it("a slug change touches the Work's id tag and the list, which holds every slug lookup", async () => {
    const work = await existing('published')
    await publish(work.id, { slug: `${work.slug}-yeni` })
    expect(sent()).toEqual([tagSet(workTag(work.id), WORKS_TAG)])
  })

  it('publishing a pending draft sends its tags then', async () => {
    const work = await existing('published')
    await saveDraft(work.id, { title: 'Taslak' })
    await publish(work.id)
    expect(sent()).toEqual([tagSet(workTag(work.id), WORKS_TAG)])
  })
})

describe('Home', () => {
  it('featuring a Work touches Home too', async () => {
    const work = await existing('published')
    await publish(work.id, { featured: true, featuredOrder: 1 })
    expect(sent()).toEqual([tagSet(workTag(work.id), WORKS_TAG, HOME_TAG)])
  })

  it('unfeaturing a Work touches Home too', async () => {
    const work = await existing('published', { featured: true, featuredOrder: 1 })
    await publish(work.id, { featured: false })
    expect(sent()).toEqual([tagSet(workTag(work.id), WORKS_TAG, HOME_TAG)])
  })

  it('editing a Featured Work touches Home too', async () => {
    const work = await existing('published', { featured: true, featuredOrder: 1 })
    await publish(work.id, { title: 'Yeni başlık' })
    expect(sent()).toEqual([tagSet(workTag(work.id), WORKS_TAG, HOME_TAG)])
  })

  it('publishing a new Featured Work touches Home too', async () => {
    const work = await createWork('published', { featured: true, featuredOrder: 2 })
    expect(sent()).toEqual([tagSet(workTag(work.id), WORKS_TAG, HOME_TAG)])
  })

  it('a featuring saved only as a draft does not count: the published Work is not featured', async () => {
    const work = await existing('published')
    await saveDraft(work.id, { featured: true })
    await unpublish(work.id)
    expect(sent()).toEqual([tagSet(workTag(work.id), WORKS_TAG)])
  })
})

describe('unpublishing a Work', () => {
  it('touches the Work and the list', async () => {
    const work = await existing('published')
    await unpublish(work.id)
    expect(sent()).toEqual([tagSet(workTag(work.id), WORKS_TAG)])
  })

  it('touches Home too when the Work was featured', async () => {
    const work = await existing('published', { featured: true, featuredOrder: 1 })
    await unpublish(work.id)
    expect(sent()).toEqual([tagSet(workTag(work.id), WORKS_TAG, HOME_TAG)])
  })
})

describe('deleting a Work', () => {
  it('touches the Work and the list when it was published', async () => {
    const work = await existing('published')
    await remove(work.id)
    expect(sent()).toEqual([tagSet(workTag(work.id), WORKS_TAG)])
  })

  it('touches Home too when it was featured', async () => {
    const work = await existing('published', { featured: true, featuredOrder: 1 })
    await remove(work.id)
    expect(sent()).toEqual([tagSet(workTag(work.id), WORKS_TAG, HOME_TAG)])
  })

  it('judges by the published Work, not a newer draft', async () => {
    const work = await existing('published', { featured: true, featuredOrder: 1 })
    await saveDraft(work.id, { featured: false })
    await remove(work.id)
    expect(sent()).toEqual([tagSet(workTag(work.id), WORKS_TAG, HOME_TAG)])
  })

  it('sends nothing for a Work that was never published', async () => {
    const work = await existing('draft')
    await remove(work.id)
    expect(sent()).toEqual([])
  })
})

describe('a single-entry page', () => {
  const save = (slug: 'site' | 'about' | 'privacy', status: 'draft' | 'published') =>
    site.cms.updateGlobal({
      slug,
      data: { _status: status },
      draft: status === 'draft',
      user: as.user(),
      overrideAccess: as.overrideAccess,
    })

  it.each(['site', 'about', 'privacy'] as const)(
    '%s touches only its own tag on publish',
    async (slug) => {
      await save(slug, 'published')
      expect(sent()).toEqual([[pageTag(slug)]])
    },
  )

  it.each(['site', 'about', 'privacy'] as const)(
    '%s sends nothing on a draft save',
    async (slug) => {
      await save(slug, 'published')
      site.revalidations.length = 0
      await save(slug, 'draft')
      expect(sent()).toEqual([])
    },
  )

  it('the Statement touches only the Site tag on publish, and nothing on a draft save', async () => {
    const saveStatement = (status: 'draft' | 'published', text: string) =>
      site.cms.updateGlobal({
        slug: 'site',
        data: { statement: text, _status: status },
        draft: status === 'draft',
        user: as.user(),
        overrideAccess: as.overrideAccess,
      })
    await saveStatement('published', 'Önce ve sonra.')
    expect(sent()).toEqual([[pageTag('site')]])
    site.revalidations.length = 0
    await saveStatement('draft', 'Taslak metin.')
    expect(sent()).toEqual([])
  })
})

describe('a failed notification', () => {
  let failing: TestSite

  beforeAll(async () => {
    failing = await createTestSite({
      revalidate: () => Promise.reject(new Error('connect ECONNREFUSED web:3000')),
    })
  }, 30_000)

  afterAll(async () => {
    await failing?.close()
  })

  it("is logged and does not block the Editor's save", async () => {
    const error = vi.spyOn(failing.cms.logger, 'error')
    const user = await failing.createEditor()
    const cover = (await failing.uploadImage(user)).id
    const work = await failing.cms.create({
      collection: 'works',
      data: {
        title: 'Kayıt yine de',
        slug: 'kayit-yine-de',
        disciplines: ['grafik'],
        year: 2024,
        cover,
        mainMedia: { kind: 'image', image: cover },
        _status: 'published',
      },
      user,
      overrideAccess: false,
    })

    expect(work._status).toBe('published')
    expect(
      (await failing.cms.findByID({ collection: 'works', id: work.id, draft: false })).title,
    ).toBe('Kayıt yine de')
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ msg: expect.stringContaining('ECONNREFUSED') }),
    )
  })
})

describe('the notification', () => {
  it('goes out once the change is stored, so a page rebuilt right away reads it', async () => {
    let seen: string | undefined
    const ordered = await createTestSite({
      revalidate: async (tags) => {
        const id = Number(tags.find((tag) => tag.startsWith('work:'))?.split(':')[1])
        seen = (await ordered.cms.findByID({ collection: 'works', id, draft: false })).title
      },
    })
    try {
      const user = await ordered.createEditor()
      const cover = (await ordered.uploadImage(user)).id
      await ordered.cms.create({
        collection: 'works',
        data: {
          title: 'Yayında',
          slug: 'yayinda',
          disciplines: ['motion'],
          year: 2024,
          cover,
          mainMedia: { kind: 'image', image: cover },
          _status: 'published',
        },
        user,
        overrideAccess: false,
      })
      expect(seen).toBe('Yayında')
    } finally {
      await ordered.close()
    }
  }, 30_000)
})
