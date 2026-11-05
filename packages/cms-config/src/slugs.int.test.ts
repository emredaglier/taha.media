import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestSite, type TestSite } from './testing'

let site: TestSite

beforeAll(async () => {
  site = await createTestSite()
}, 30_000)

afterAll(async () => {
  await site?.close()
})

/** Saves a Work the way an Editor does (access rules applied). */
async function save(
  data: { title: string; slug?: string },
  status: 'draft' | 'published' = 'draft',
) {
  const editor = await site.createEditor()
  const base = { collection: 'works', user: editor, overrideAccess: false } as const
  const fields = { disciplines: ['kurgu' as const], year: 2025, ...data }
  return status === 'draft'
    ? site.cms.create({ ...base, data: fields, draft: true })
    : site.cms.create({
        ...base,
        data: { ...fields, slug: data.slug ?? '', _status: 'published' },
        draft: false,
      })
}

describe('the slug of a new Work', () => {
  it.each([
    ['Şişli Çocuk Ağaçları', 'sisli-cocuk-agaclari'],
    ['IŞIK ve İSTANBUL', 'isik-ve-istanbul'],
    ['ığüşöç İĞÜŞÖÇ', 'igusoc-igusoc'],
    ['  Kış: Reklamı (2025)!  ', 'kis-reklami-2025'],
    ['A -- B___C', 'a-b-c'],
    ['Café déjà vu', 'cafe-deja-vu'],
  ])('is made from the title "%s" as %s', async (title, slug) => {
    expect((await save({ title })).slug).toBe(slug)
  })

  it('keeps a slug the Editor typed, cleaned the same way', async () => {
    expect((await save({ title: 'Başlık', slug: 'Özel Adres' })).slug).toBe('ozel-adres')
  })
})

describe('slugs are unique among Works', () => {
  it('refuses a second Work with the same slug', async () => {
    await save({ title: 'Aynı Ad' })
    await expect(save({ title: 'Aynı Ad' })).rejects.toThrow()
  })
})

describe('renaming a Work’s slug', () => {
  async function edit(id: number | string, data: Record<string, unknown>, draft: boolean) {
    const editor = await site.createEditor()
    return site.cms.update({
      collection: 'works',
      id,
      data: { generateSlug: false, ...data },
      draft,
      user: editor,
      overrideAccess: false,
    })
  }

  it('records the old slug when a published slug changes', async () => {
    const created = await save({ title: 'Ilk Adres' }, 'published')
    const renamed = await edit(created.id, { slug: 'Yeni Adres', _status: 'published' }, false)
    expect(renamed.slug).toBe('yeni-adres')
    expect(renamed.previousSlugs).toEqual(['ilk-adres'])
    const again = await edit(created.id, { slug: 'ucuncu', _status: 'published' }, false)
    expect(again.previousSlugs).toEqual(['ilk-adres', 'yeni-adres'])
  })

  it('does not list the current slug when a Work returns to an old one', async () => {
    const created = await save({ title: 'Gidip Gelen' }, 'published')
    await edit(created.id, { slug: 'baska', _status: 'published' }, false)
    const back = await edit(created.id, { slug: 'gidip-gelen', _status: 'published' }, false)
    expect(back.previousSlugs).toEqual(['baska'])
  })

  it('records nothing for a slug that was never published', async () => {
    const created = await save({ title: 'Taslak Ad' })
    const renamed = await edit(created.id, { slug: 'taslak-yeni' }, true)
    expect(renamed.slug).toBe('taslak-yeni')
    expect(renamed.previousSlugs ?? []).toEqual([])
  })

  it('records nothing until a draft rename of a published Work is published', async () => {
    const created = await save({ title: 'Yayinda Ad' }, 'published')
    await edit(created.id, { slug: 'taslak-rename' }, true)
    const published = await site.cms.findByID({ collection: 'works', id: created.id, draft: false })
    expect(published.slug).toBe('yayinda-ad')
    expect(published.previousSlugs ?? []).toEqual([])
    const live = await edit(created.id, { slug: 'taslak-rename', _status: 'published' }, false)
    expect(live.previousSlugs).toEqual(['yayinda-ad'])
  })
})
