import { httpRevalidationTransport, type User, type WorkDoc } from '@taha/cms-config'
import { createTestSite, type TestSite } from '@taha/cms-config/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { POST } from '../app/internal/revalidate/route'
import { nextCache } from '../test/next-cache-fake'
import { getAbout, getPrivacy, getSite } from './pages'
import { getFeaturedWorks, getPublishedWorkSlugs, getWorkBySlug, getWorks } from './works'

/**
 * The whole loop the way production runs it, minus the network: reads go through the (fake)
 * Next cache, an Editor saves in `cms`, `cms` POSTs the tags with the production transport, and
 * web's revalidate route expires them. A read is fresh again only if `cms` sent the tag it uses.
 */
let site: TestSite
let editor: User
let coverId: number
let loopId: number

beforeAll(async () => {
  process.env.REVALIDATE_SECRET = 'shared-secret'
  site = await createTestSite({
    revalidate: httpRevalidationTransport({
      url: 'http://web:3000/internal/revalidate',
      secret: 'shared-secret',
      fetch: (url, init) => POST(new Request(url, init)),
    }),
  })
  Object.assign(process.env, site.webEnv)
  editor = await site.createEditor()
  coverId = (await site.uploadImage(editor)).id
  // Publishing a featured Work needs a 16:9 Preview loop (#43).
  loopId = (await site.uploadVideo(editor, { use: 'previewLoop' })).id
}, 30_000)

afterAll(async () => {
  delete process.env.REVALIDATE_SECRET
  nextCache.reset()
  await site?.close()
})

beforeEach(() => {
  nextCache.reset()
  nextCache.caching = true
})

const as = () => ({ user: editor, overrideAccess: false }) as const

const createWork = (data: Partial<WorkDoc> & { title: string; slug: string }) =>
  site.cms.create({
    collection: 'works',
    data: {
      disciplines: ['kurgu'],
      year: 2025,
      cover: coverId,
      mainMedia: { kind: 'image', image: coverId },
      ...(data.featured ? { previewLoop: loopId } : {}),
      _status: 'published',
      ...data,
    },
    ...as(),
  })

const publish = (id: number, data: Partial<WorkDoc>) =>
  site.cms.update({
    collection: 'works',
    id,
    data: { ...(data.featured ? { previewLoop: loopId } : {}), ...data, _status: 'published' },
    ...as(),
  })

const titles = (works: { title: string }[]) => works.map((work) => work.title)

describe('reads are cached', () => {
  it('until cms sends one of their tags', async () => {
    const work = await createWork({ title: 'Önbellek', slug: 'onbellek' })
    expect((await getWorks()).find((w) => w.id === work.id)?.year).toBe(2025)

    // A write that bypasses cms's hooks sends nothing, so the cached list stays as it was.
    await site
      .cmsClient()
      .execute({ sql: 'UPDATE works SET year = 1999 WHERE id = ?', args: [work.id] })
    expect((await getWorks()).find((w) => w.id === work.id)?.year).toBe(2025)

    await publish(work.id, { year: 2001 })
    expect((await getWorks()).find((w) => w.id === work.id)?.year).toBe(2001)
  })
})

describe('a published Work', () => {
  it('reaches the Works list, its page and the static params', async () => {
    expect(titles(await getWorks())).not.toContain('Yeni iş')
    expect(await getWorkBySlug('yeni-is')).toEqual({ kind: 'notFound' })
    expect(await getPublishedWorkSlugs()).not.toContain('yeni-is')

    await createWork({ title: 'Yeni iş', slug: 'yeni-is' })

    expect(titles(await getWorks())).toContain('Yeni iş')
    expect(await getWorkBySlug('yeni-is')).toMatchObject({
      kind: 'work',
      work: { title: 'Yeni iş' },
    })
    expect(await getPublishedWorkSlugs()).toContain('yeni-is')
  })

  it('shows its published edits on its page', async () => {
    const work = await createWork({ title: 'İlk hali', slug: 'ilk-hali' })
    expect(await getWorkBySlug('ilk-hali')).toMatchObject({ work: { title: 'İlk hali' } })

    await publish(work.id, { title: 'Son hali' })
    expect(await getWorkBySlug('ilk-hali')).toMatchObject({ work: { title: 'Son hali' } })
  })

  it('keeps showing the published version while a draft is saved', async () => {
    const work = await createWork({ title: 'Yayındaki', slug: 'yayindaki' })
    expect(await getWorkBySlug('yayindaki')).toMatchObject({ work: { title: 'Yayındaki' } })
    const before = nextCache.revalidated.length

    await site.cms.update({
      collection: 'works',
      id: work.id,
      data: { title: 'Taslak', _status: 'draft' },
      draft: true,
      ...as(),
    })
    expect(nextCache.revalidated.length).toBe(before)
    expect(await getWorkBySlug('yayindaki')).toMatchObject({ work: { title: 'Yayındaki' } })
  })

  it('renamed: the new slug resolves and the old one redirects to it', async () => {
    const work = await createWork({ title: 'Eski ad', slug: 'eski-ad' })
    expect(await getWorkBySlug('eski-ad')).toMatchObject({ kind: 'work' })
    expect(await getWorkBySlug('yeni-ad')).toEqual({ kind: 'notFound' })

    await publish(work.id, { slug: 'yeni-ad' })

    expect(await getWorkBySlug('eski-ad')).toEqual({ kind: 'redirect', slug: 'yeni-ad' })
    expect(await getWorkBySlug('yeni-ad')).toMatchObject({ kind: 'work', work: { id: work.id } })
    expect(await getPublishedWorkSlugs()).toContain('yeni-ad')
    expect(await getPublishedWorkSlugs()).not.toContain('eski-ad')
  })

  it('unpublished: leaves the list and its page', async () => {
    const work = await createWork({ title: 'Kalkacak', slug: 'kalkacak' })
    expect(titles(await getWorks())).toContain('Kalkacak')
    expect(await getWorkBySlug('kalkacak')).toMatchObject({ kind: 'work' })

    await site.cms.update({ collection: 'works', id: work.id, data: { _status: 'draft' }, ...as() })

    expect(titles(await getWorks())).not.toContain('Kalkacak')
    expect(await getWorkBySlug('kalkacak')).toEqual({ kind: 'notFound' })
  })

  it('deleted: leaves the list and its page', async () => {
    const work = await createWork({ title: 'Silinecek', slug: 'silinecek' })
    expect(await getWorkBySlug('silinecek')).toMatchObject({ kind: 'work' })

    await site.cms.delete({ collection: 'works', id: work.id, ...as() })

    expect(titles(await getWorks())).not.toContain('Silinecek')
    expect(await getWorkBySlug('silinecek')).toEqual({ kind: 'notFound' })
  })
})

describe('Home', () => {
  it('shows a Work once it is featured, and drops it once unfeatured', async () => {
    const work = await createWork({ title: 'Vitrin', slug: 'vitrin' })
    expect(titles(await getFeaturedWorks())).not.toContain('Vitrin')

    await publish(work.id, { featured: true, featuredOrder: 1 })
    expect(titles(await getFeaturedWorks())).toContain('Vitrin')

    await publish(work.id, { title: 'Vitrin 2' })
    expect(titles(await getFeaturedWorks())).toContain('Vitrin 2')

    await publish(work.id, { featured: false })
    expect(titles(await getFeaturedWorks())).not.toContain('Vitrin 2')
  })
})

describe('the single-entry pages', () => {
  it('each shows its published change', async () => {
    expect(await getSite()).toBeNull()
    expect(await getAbout()).toBeNull()
    expect(await getPrivacy()).toBeNull()

    for (const slug of ['site', 'about', 'privacy'] as const) {
      await site.cms.updateGlobal({ slug, data: { _status: 'published' }, ...as() })
    }

    expect(await getSite()).not.toBeNull()
    expect(await getAbout()).not.toBeNull()
    expect(await getPrivacy()).not.toBeNull()
  })
})
