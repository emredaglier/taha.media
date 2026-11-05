import type { Discipline } from '@taha/cms-config'
import { createTestSite, type TestSite } from '@taha/cms-config/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getPublishedWorkSlugs, getWorkBySlug, getWorks } from './works'

let site: TestSite
let coverUrls: { original: string }

beforeAll(async () => {
  site = await createTestSite()
  // web opens the same file the way it does in production: from its environment.
  Object.assign(process.env, site.webEnv)

  const editor = await site.createEditor()
  const cover = await site.uploadImage(editor, { alt: 'Kapak', width: 3000, height: 2000 })
  coverUrls = { original: cover.url ?? '' }
  type Fields = { title: string; slug: string; disciplines?: Discipline[] }
  const save = (data: Fields, status: 'draft' | 'published') =>
    site.cms.create({
      collection: 'works',
      data: { disciplines: ['kurgu'], year: 2025, cover: cover.id, ...data, _status: status },
      draft: status === 'draft',
      user: editor,
      overrideAccess: false,
    })

  await save({ title: 'Yayında', slug: 'yayinda', disciplines: ['motion', 'grafik'] }, 'published')
  await save({ title: 'Taslak', slug: 'taslak' }, 'draft')
  // Published once, then edited as a draft: the site keeps showing the published version.
  const edited = await save({ title: 'İlk hali', slug: 'duzenlenen' }, 'published')
  await site.cms.update({
    collection: 'works',
    id: edited.id,
    data: { title: 'Yayınlanmamış düzenleme' },
    draft: true,
    user: editor,
    overrideAccess: false,
  })

  // Renamed twice while published, so two old slugs lead to the new one.
  const renamed = await save({ title: 'Eski Ad', slug: 'eski-ad' }, 'published')
  for (const slug of ['ara-ad', 'son-ad']) {
    await site.cms.update({
      collection: 'works',
      id: renamed.id,
      data: { slug, generateSlug: false, _status: 'published' },
      user: editor,
      overrideAccess: false,
    })
  }
  // Renamed, but the Work is not published any more: its old slug goes nowhere.
  const hidden = await save({ title: 'Gizli', slug: 'hic-yayinlanmamis-eski' }, 'published')
  await site.cms.update({
    collection: 'works',
    id: hidden.id,
    data: { slug: 'hic-yayinlanmamis-yeni', generateSlug: false, _status: 'draft' },
    user: editor,
    overrideAccess: false,
  })
  // A Work that took a slug another Work once had: the current owner wins over the old trail.
  const mover = await save({ title: 'Eski Sahip', slug: 'devralinan' }, 'published')
  await site.cms.update({
    collection: 'works',
    id: mover.id,
    data: { slug: 'tasindi', generateSlug: false, _status: 'published' },
    user: editor,
    overrideAccess: false,
  })
  await site.cms.delete({ collection: 'works', id: mover.id, user: editor, overrideAccess: false })
  await save({ title: 'Devralan', slug: 'devralinan' }, 'published')
}, 30_000)

afterAll(async () => {
  await site?.close()
})

describe('the Works list', () => {
  it('returns published Works only, as they were published', async () => {
    const works = await getWorks()
    const titles = works.map((work) => work.title)
    expect(titles).toEqual(expect.arrayContaining(['Yayında', 'İlk hali']))
    expect(titles).not.toContain('Taslak')
    expect(titles).not.toContain('Yayınlanmamış düzenleme')
  })
})

describe('a Work by slug', () => {
  it('returns a published Work', async () => {
    expect(await getWorkBySlug('yayinda')).toMatchObject({
      kind: 'work',
      work: { title: 'Yayında', slug: 'yayinda', disciplines: ['motion', 'grafik'], year: 2025 },
    })
  })

  it('returns the published version of a Work with an unpublished edit', async () => {
    const result = await getWorkBySlug('duzenlenen')
    expect(result.kind === 'work' && result.work.title).toBe('İlk hali')
  })

  it('is not found for a draft and for an unknown slug', async () => {
    expect(await getWorkBySlug('taslak')).toEqual({ kind: 'notFound' })
    expect(await getWorkBySlug('yok-boyle-bir-is')).toEqual({ kind: 'notFound' })
  })

  it('redirects an old slug to the current one, through any number of renames', async () => {
    expect(await getWorkBySlug('eski-ad')).toEqual({ kind: 'redirect', slug: 'son-ad' })
    expect(await getWorkBySlug('ara-ad')).toEqual({ kind: 'redirect', slug: 'son-ad' })
    expect(await getWorkBySlug('son-ad')).toMatchObject({ kind: 'work' })
  })

  it('does not redirect to a Work that is not published', async () => {
    expect(await getWorkBySlug('hic-yayinlanmamis-eski')).toEqual({ kind: 'notFound' })
  })

  it('serves a Work that took over another Work’s old slug', async () => {
    expect(await getWorkBySlug('devralinan')).toMatchObject({
      kind: 'work',
      work: { title: 'Devralan' },
    })
  })
})

describe('the published slugs', () => {
  it('lists every published Work’s current slug, for static params', async () => {
    expect((await getPublishedWorkSlugs()).sort()).toEqual(
      ['yayinda', 'duzenlenen', 'son-ad', 'devralinan'].sort(),
    )
  })
})

describe('a Work cover', () => {
  it('carries size, focal point, alt and a srcset of generated sizes only', async () => {
    const result = await getWorkBySlug('yayinda')
    if (result.kind !== 'work') throw new Error('expected a Work')
    const { cover } = result.work
    expect(cover).toMatchObject({
      alt: 'Kapak',
      width: 3000,
      height: 2000,
      focalPoint: { x: 50, y: 50 },
    })
    const entries = cover.srcset.split(', ')
    expect(entries.length).toBeGreaterThanOrEqual(3)
    expect(cover.srcset).not.toContain(coverUrls.original)
    expect(cover.src).not.toBe(coverUrls.original)
  })

  it('is on every Work in the list', async () => {
    for (const work of await getWorks()) expect(work.cover.alt).toBe('Kapak')
  })
})
