import type { WorkDoc } from '@taha/cms-config'
import { createTestSite, type TestSite } from '@taha/cms-config/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getWorkBySlug, type Work } from './works'

let site: TestSite

beforeAll(async () => {
  site = await createTestSite()
  Object.assign(process.env, site.webEnv)

  const editor = await site.createEditor()
  const cover = await site.uploadImage(editor, { alt: 'Kapak', width: 3000, height: 2000 })
  const share = await site.uploadImage(editor, { alt: 'Paylaşım', width: 2400, height: 1260 })
  const stillA = await site.uploadImage(editor, { alt: 'Birinci kare', width: 1920, height: 1080 })
  const stillB = await site.uploadImage(editor, { alt: 'İkinci kare', width: 1080, height: 1920 })

  const text = (value: string, format = 0) => ({
    type: 'text',
    text: value,
    format,
    version: 1,
    detail: 0,
    mode: 'normal',
    style: '',
  })
  const paragraph = (...children: object[]) => ({
    type: 'paragraph',
    children,
    direction: 'ltr' as const,
    format: '',
    indent: 0,
    version: 1,
  })
  const description: NonNullable<WorkDoc['description']> = {
    root: {
      type: 'root',
      children: [
        paragraph(text('Bir kış reklamı için '), text('kurgu', 1), text(' ve renk.')),
        paragraph(text('İkinci paragraf.')),
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  }

  const save = (data: Partial<WorkDoc> & { title: string; slug: string }) =>
    site.cms.create({
      collection: 'works',
      data: { disciplines: ['kurgu'], year: 2025, cover: cover.id, ...data, _status: 'published' },
      draft: false,
      user: editor,
      overrideAccess: false,
    })

  await save({
    title: 'Ayrıntılı',
    slug: 'ayrintili',
    client: 'Örnek Marka',
    role: 'Kurgu ve renk',
    credits: [
      { name: 'Zeynep', role: 'Yönetmen' },
      { name: 'Ali', role: 'Ses' },
      { name: 'Can', role: 'Müzik' },
    ],
    description,
    stills: [{ image: stillB.id }, { image: stillA.id }],
  })
  await save({
    title: 'Özel SEO',
    slug: 'ozel-seo',
    description,
    seo: { title: 'Paylaşım başlığı', description: 'Paylaşım açıklaması', image: share.id },
  })
  await save({ title: 'Yalın', slug: 'yalin' })
}, 60_000)

afterAll(async () => {
  await site?.close()
})

async function work(slug: string): Promise<Work> {
  const result = await getWorkBySlug(slug)
  if (result.kind !== 'work') throw new Error(`expected a Work for ${slug}`)
  return result.work
}

describe('a Work with details', () => {
  it('returns client, role, description and credits in the order the Editor set', async () => {
    const detailed = await work('ayrintili')
    expect(detailed).toMatchObject({ client: 'Örnek Marka', role: 'Kurgu ve renk' })
    expect(detailed.credits).toEqual([
      { name: 'Zeynep', role: 'Yönetmen' },
      { name: 'Ali', role: 'Ses' },
      { name: 'Can', role: 'Müzik' },
    ])
    expect(detailed.description?.root.children).toHaveLength(2)
  })

  it('returns stills as images with a srcset of generated sizes, in order', async () => {
    const { stills } = await work('ayrintili')
    expect(stills.map((still) => still.alt)).toEqual(['İkinci kare', 'Birinci kare'])
    expect(stills[0]).toMatchObject({ width: 1080, height: 1920 })
    for (const still of stills) {
      expect(still.srcset).toMatch(/\.webp \d+w/)
      expect(still.srcset).not.toContain('.jpg')
    }
  })

  it('has empty details on a bare Work', async () => {
    expect(await work('yalin')).toMatchObject({
      client: null,
      role: null,
      credits: [],
      description: null,
      stills: [],
    })
  })
})

describe('Work SEO', () => {
  it('falls back to the title, the start of the description and the cover', async () => {
    const { seo, cover } = await work('ayrintili')
    expect(seo).toEqual({
      title: 'Ayrıntılı',
      description: 'Bir kış reklamı için kurgu ve renk. İkinci paragraf.',
      image: cover,
    })
  })

  it('has an empty description when there is no description text', async () => {
    expect((await work('yalin')).seo.description).toBe('')
  })

  it('uses the overrides when set', async () => {
    const { seo, cover } = await work('ozel-seo')
    expect(seo.title).toBe('Paylaşım başlığı')
    expect(seo.description).toBe('Paylaşım açıklaması')
    expect(seo.image).toMatchObject({ alt: 'Paylaşım', width: 2400 })
    expect(seo.image).not.toEqual(cover)
  })
})
