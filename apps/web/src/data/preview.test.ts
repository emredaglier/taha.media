import type { User } from '@taha/cms-config'
import { createTestSite, type TestSite } from '@taha/cms-config/testing'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// The preview container is started with PREVIEW=1 (ADR-0001). The instance reads it once, when it
// loads, so it is set before anything is imported.
vi.hoisted(() => {
  process.env.PREVIEW = '1'
})

import { getAbout, getPrivacy, getSite } from './pages'
import { getFeaturedWorks, getPublishedWorkSlugs, getWorkBySlug, getWorks } from './works'

let site: TestSite
let editor: User

beforeAll(async () => {
  site = await createTestSite()
  Object.assign(process.env, site.webEnv)
  editor = await site.createEditor()
  const cover = await site.uploadImage(editor, { alt: 'Kapak' })

  const work = (title: string, slug: string, extra: Record<string, unknown> = {}) => ({
    title,
    slug,
    disciplines: ['kurgu' as const],
    year: 2025,
    cover: cover.id,
    mainMedia: { kind: 'image' as const, image: cover.id },
    ...extra,
  })
  const as = { user: editor, overrideAccess: false } as const

  await site.cms.create({
    collection: 'works',
    data: { ...work('Yayında', 'yayinda'), _status: 'published' },
    ...as,
  })
  // Never published: only the preview shows it.
  await site.cms.create({
    collection: 'works',
    data: { ...work('Yalnız taslak', 'yalniz-taslak', { featured: true, featuredOrder: 1 }) },
    draft: true,
    ...as,
  })
  // Published, then edited as a draft: the preview shows the edit.
  const edited = await site.cms.create({
    collection: 'works',
    data: { ...work('İlk hali', 'duzenlenen'), _status: 'published' },
    ...as,
  })
  await site.cms.update({
    collection: 'works',
    id: edited.id,
    data: { title: 'Taslak düzenleme' },
    draft: true,
    ...as,
  })
  // A draft that could not be published yet (no cover, no main media): not renderable.
  await site.cms.create({
    collection: 'works',
    data: { title: 'Yarım', slug: 'yarim', disciplines: ['motion'], year: 2024 } as never,
    draft: true,
    ...as,
  })

  const writeGlobal = (
    slug: 'site' | 'about' | 'privacy',
    data: Record<string, unknown>,
    status: 'draft' | 'published',
  ) =>
    site.cms.updateGlobal({
      slug,
      data: { ...data, _status: status } as never,
      draft: status === 'draft',
      ...as,
    })
  await writeGlobal('site', { statement: 'Yayındaki giriş.' }, 'published')
  await writeGlobal('site', { statement: 'Taslak giriş.' }, 'draft')
  await writeGlobal('about', { disciplineLines: { kurgu: 'Taslak kurgu satırı.' } }, 'draft')
  await writeGlobal('privacy', {}, 'draft')
}, 60_000)

afterAll(async () => {
  delete process.env.PREVIEW
  await site?.close()
})

describe('the preview instance (PREVIEW=1)', () => {
  it('lists the latest draft of every Work, never-published ones included', async () => {
    const titles = (await getWorks()).map((work) => work.title)
    expect(titles.sort()).toEqual(['Taslak düzenleme', 'Yalnız taslak', 'Yayında'].sort())
  })

  it('leaves out a draft that has no cover or main media yet, instead of failing the page', async () => {
    expect((await getWorks({ discipline: 'motion' })).map((work) => work.title)).toEqual([])
    expect(await getWorkBySlug('yarim')).toEqual({ kind: 'notFound' })
  })

  it('reads a Work by slug as its latest draft', async () => {
    expect(await getWorkBySlug('yalniz-taslak')).toMatchObject({
      kind: 'work',
      work: { title: 'Yalnız taslak' },
    })
    expect(await getWorkBySlug('duzenlenen')).toMatchObject({
      kind: 'work',
      work: { title: 'Taslak düzenleme' },
    })
  })

  it('shows a draft Featured Work on Home', async () => {
    expect((await getFeaturedWorks()).map((work) => work.title)).toEqual(['Yalnız taslak'])
  })

  it('includes draft slugs in the static params', async () => {
    expect((await getPublishedWorkSlugs()).sort()).toEqual(
      ['duzenlenen', 'yalniz-taslak', 'yarim', 'yayinda'].sort(),
    )
  })

  it('reads each single-entry page as its latest draft, published before or not', async () => {
    expect((await getSite())?.statement).toBe('Taslak giriş.')
    expect((await getAbout())?.disciplineLines).toEqual([
      { discipline: 'kurgu', line: 'Taslak kurgu satırı.' },
    ])
    expect(await getPrivacy()).toMatchObject({ body: null })
  })
})
