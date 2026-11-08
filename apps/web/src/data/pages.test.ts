import { createTestSite, type TestSite } from '@taha/cms-config/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getAbout, getPrivacy, getSite } from './pages'

let site: TestSite
let editor: Awaited<ReturnType<TestSite['createEditor']>>

const textNode = (value: string, format = 0) => ({
  type: 'text',
  text: value,
  format,
  version: 1,
  detail: 0,
  mode: 'normal',
  style: '',
})
const block = (type: string, children: object[], extra: object = {}) => ({
  type,
  children,
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0,
  version: 1,
  ...extra,
})
const doc = (...children: object[]) => ({
  root: {
    type: 'root',
    children,
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    version: 1,
  },
})
const paragraphs = (...texts: string[]) =>
  doc(...texts.map((value) => block('paragraph', [textNode(value)])))

beforeAll(async () => {
  site = await createTestSite()
  Object.assign(process.env, site.webEnv)
  editor = await site.createEditor()
}, 60_000)

afterAll(async () => {
  await site?.close()
})

const write = <S extends 'site' | 'about' | 'privacy'>(
  slug: S,
  data: Record<string, unknown>,
  status: 'draft' | 'published',
) =>
  site.cms.updateGlobal({
    slug,
    data: { ...data, _status: status } as never,
    draft: status === 'draft',
    user: editor,
    overrideAccess: false,
  })

describe('drafts and publishing', () => {
  it('reads nothing while a page has never been published', async () => {
    await write('privacy', { body: paragraphs('Taslak metin.') }, 'draft')
    expect(await getPrivacy()).toBeNull()
  })

  it('returns the published content, not a newer draft', async () => {
    await write('privacy', { body: paragraphs('Yayındaki metin.') }, 'published')
    await write('privacy', { body: paragraphs('Yeni taslak.') }, 'draft')
    const privacy = await getPrivacy()
    expect(privacy?.seo.description).toBe('Yayındaki metin.')
  })

  it('keeps versions of each page', async () => {
    const { totalDocs } = await site.cms.findGlobalVersions({ slug: 'privacy' })
    expect(totalDocs).toBeGreaterThanOrEqual(3)
  })
})

describe('Site', () => {
  it('refuses a Video that is not a showreel in either Showreel field', async () => {
    const loop = await site.uploadVideo(editor, { use: 'previewLoop' })
    await expect(write('site', { showreel: loop.id }, 'draft')).rejects.toThrow(/showreel/i)
    await expect(write('site', { showreelPhone: loop.id }, 'draft')).rejects.toThrow(/showreel/i)
  })

  it('reads the showreel, phone variant, poster, link, statement, email and socials', async () => {
    const reel = await site.uploadVideo(editor, { use: 'showreel' })
    const phone = await site.uploadVideo(editor, { use: 'showreel' })
    const poster = await site.uploadImage(editor, { alt: 'Showreel kapağı' })
    await write(
      'site',
      {
        showreel: reel.id,
        showreelPhone: phone.id,
        showreelPoster: poster.id,
        showreelLink: { url: 'https://vimeo.com/123456789' },
        statement: 'Kurgu, hareket ve grafik ile hikayeyi hareketle anlatıyorum.',
        email: 'taha@example.com',
        socials: [
          { platform: 'Instagram', url: 'https://instagram.com/taha' },
          { platform: 'Vimeo', url: 'https://vimeo.com/taha' },
        ],
      },
      'published',
    )
    const result = await getSite()
    expect(result).toMatchObject({
      showreel: { id: reel.id, hasAudio: false },
      showreelPhone: { id: phone.id },
      showreelPoster: { alt: 'Showreel kapağı' },
      showreelLink: { provider: 'vimeo', id: '123456789', url: 'https://vimeo.com/123456789' },
      statement: 'Kurgu, hareket ve grafik ile hikayeyi hareketle anlatıyorum.',
      email: 'taha@example.com',
    })
    expect(result?.socials.map((s) => s.platform)).toEqual(['Instagram', 'Vimeo'])
    expect(result?.showreel?.poster.srcset).toMatch(/\.webp \d+w/)
  })

  it('stores provider and id for a YouTube link and refuses other addresses', async () => {
    await write(
      'site',
      { showreelLink: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } },
      'published',
    )
    expect((await getSite())?.showreelLink).toMatchObject({
      provider: 'youtube',
      id: 'dQw4w9WgXcQ',
    })
    await expect(
      write('site', { showreelLink: { url: 'https://example.com/video' } }, 'draft'),
    ).rejects.toMatchObject({
      data: { errors: [{ message: expect.stringMatching(/Vimeo veya YouTube/) }] },
    })
  })

  it('falls back to the site name, the statement and the poster in SEO, with overrides winning', async () => {
    const result = await getSite()
    expect(result?.seo).toMatchObject({
      title: 'taha.media',
      description: 'Kurgu, hareket ve grafik ile hikayeyi hareketle anlatıyorum.',
      image: { alt: 'Showreel kapağı' },
    })
    const share = await site.uploadImage(editor, { alt: 'Paylaşım' })
    await write(
      'site',
      { seo: { title: 'Özel başlık', description: 'Özel açıklama', image: share.id } },
      'published',
    )
    expect((await getSite())?.seo).toMatchObject({
      title: 'Özel başlık',
      description: 'Özel açıklama',
      image: { alt: 'Paylaşım' },
    })
  })
})

describe('the Statement', () => {
  // Each case clears the SEO override, so the cases do not depend on order.
  const saveStatement = (statement: string | null) =>
    write('site', { statement, seo: { title: '', description: '', image: null } }, 'published')

  it('trims the text', async () => {
    await saveStatement('  Kurgu ve motion.  \n')
    expect((await getSite())?.statement).toBe('Kurgu ve motion.')
  })

  it('reads blank, whitespace-only or unset text as null', async () => {
    await saveStatement('   ')
    expect((await getSite())?.statement).toBeNull()
    await saveStatement('')
    expect((await getSite())?.statement).toBeNull()
    await saveStatement(null)
    expect((await getSite())?.statement).toBeNull()
  })

  it('gives the SEO description from the Statement', async () => {
    await saveStatement('Kurgu ve motion.')
    expect((await getSite())?.seo.description).toBe('Kurgu ve motion.')
  })

  it('lets an SEO description the Editor wrote win', async () => {
    await saveStatement('Kurgu ve motion.')
    await write('site', { seo: { description: 'Özel açıklama' } }, 'published')
    expect((await getSite())?.seo.description).toBe('Özel açıklama')
  })
})

describe('About', () => {
  it('reads portrait, bio, discipline lines and clients in order, with logos optional', async () => {
    const portrait = await site.uploadImage(editor, { alt: 'Portre' })
    const logo = await site.uploadImage(editor, { alt: 'Logo', width: 800, height: 800 })
    await write(
      'about',
      {
        portrait: portrait.id,
        bio: paragraphs('Ben Taha, kurgucuyum.', 'İkinci paragraf.'),
        disciplineLines: { grafik: 'Afişler ve kimlikler.', kurgu: 'Reklam ve film.' },
        clients: [{ name: 'Zeta' }, { name: 'Alfa', logo: logo.id }, { name: 'Mim' }],
      },
      'published',
    )
    const about = await getAbout()
    expect(about?.portrait?.alt).toBe('Portre')
    expect(about?.bio?.root.children).toHaveLength(2)
    expect(about?.disciplineLines).toEqual([
      { discipline: 'kurgu', line: 'Reklam ve film.' },
      { discipline: 'grafik', line: 'Afişler ve kimlikler.' },
    ])
    expect(about?.clients.map((c) => [c.name, c.logo?.alt ?? null])).toEqual([
      ['Zeta', null],
      ['Alfa', 'Logo'],
      ['Mim', null],
    ])
  })

  it('falls back to the page title, the start of the bio and the portrait in SEO', async () => {
    expect((await getAbout())?.seo).toMatchObject({
      title: 'Hakkımda',
      description: 'Ben Taha, kurgucuyum. İkinci paragraf.',
      image: { alt: 'Portre' },
    })
  })
})

describe('Privacy', () => {
  it('keeps H2/H3 headings and lists in the body', async () => {
    await write(
      'privacy',
      {
        body: doc(
          block('heading', [textNode('Veriler')], { tag: 'h2' }),
          block('paragraph', [textNode('Hiçbir şey saklamıyoruz.')]),
          block('list', [block('listitem', [textNode('Çerez yok')], { value: 1 })], {
            listType: 'bullet',
            start: 1,
            tag: 'ul',
          }),
        ),
      },
      'published',
    )
    const privacy = await getPrivacy()
    expect(privacy?.body?.root.children.map((n) => n.type)).toEqual([
      'heading',
      'paragraph',
      'list',
    ])
    expect(privacy?.seo).toMatchObject({
      title: 'Gizlilik',
      description: 'Veriler Hiçbir şey saklamıyoruz. Çerez yok',
      image: null,
    })
  })
})

type EditorField = { editor?: { editorConfig?: { features?: { enabledFeatures?: string[] } } } }

/** The editor features switched on for a global's rich-text field, as the admin builds its toolbar. */
function featuresOf(slug: 'about' | 'privacy', fieldName: string): string[] {
  const global = site.cms.globals.config.find((g) => g.slug === slug)
  const field = global?.fields.find((f) => 'name' in f && f.name === fieldName) as
    EditorField | undefined
  return [...(field?.editor?.editorConfig?.features?.enabledFeatures ?? [])]
    .filter((key) => key !== 'toolbarInline')
    .sort()
}

describe('rich-text editors', () => {
  it('lets About bio use only paragraphs, bold, italic and links', () => {
    expect(featuresOf('about', 'bio')).toEqual(['bold', 'italic', 'link', 'paragraph'])
  })

  it('lets Privacy also use H2/H3 headings and lists', () => {
    expect(featuresOf('privacy', 'body')).toEqual([
      'bold',
      'heading',
      'italic',
      'link',
      'orderedList',
      'paragraph',
      'unorderedList',
    ])
  })
})
