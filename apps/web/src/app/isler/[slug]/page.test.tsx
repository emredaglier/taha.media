import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { startPageSite, type PageSite } from '../../../test/page-html'
import { generateStaticParams } from './page'

let pages: PageSite

beforeAll(async () => {
  pages = await startPageSite()
}, 60_000)

afterAll(async () => {
  await pages?.close()
})

async function htmlOf(url: string) {
  const outcome = await pages.render(url)
  expect(outcome).toMatchObject({ kind: 'html', status: 200 })
  return outcome.kind === 'html' ? outcome.html : ''
}

const paragraph = (text: string) => ({
  root: {
    type: 'root',
    version: 1,
    direction: 'ltr',
    format: '',
    indent: 0,
    children: [
      {
        type: 'paragraph',
        version: 1,
        children: [{ type: 'text', version: 1, text, format: 0 }],
      },
    ],
  },
})

describe('main media', () => {
  beforeAll(async () => {
    const video = await pages.site.uploadVideo(pages.editor, {
      use: 'main',
      file: 'with-audio.mp4',
    })
    const poster = await pages.site.uploadImage(pages.editor, { alt: 'Dış poster' })
    await pages.publishWork({
      title: 'Video İş',
      slug: 'video-is',
      extra: { mainMedia: { kind: 'video', video: video.id } },
    })
    await pages.publishWork({
      title: 'Vimeo İş',
      slug: 'vimeo-is',
      extra: {
        mainMedia: {
          kind: 'external',
          externalUrl: 'https://vimeo.com/123456789',
          externalPoster: poster.id,
        },
      },
    })
    await pages.publishWork({
      title: 'YouTube İş',
      slug: 'youtube-is',
      extra: {
        mainMedia: {
          kind: 'external',
          externalUrl: 'https://youtu.be/dQw4w9WgXcQ',
          externalPoster: poster.id,
        },
      },
    })
    await pages.publishWork({ title: 'Görsel İş' })
  })

  it('shows a video with controls and the poster, that does not load before play', async () => {
    const html = await htmlOf('/isler/video-is')
    const tag = /<video[^>]*>/.exec(html)?.[0] ?? ''
    expect(tag).toContain('controls')
    expect(tag).toContain('preload="none"')
    expect(tag).toMatch(/poster="[^"]+"/)
    expect(html).toMatch(/<h1[^>]*>Video İş<\/h1>/)
  })

  it.each(['vimeo-is', 'youtube-is'])(
    'shows our poster and a play button for external media, and no iframe (%s)',
    async (slug) => {
      const html = await htmlOf(`/isler/${slug}`)
      expect(html).toContain('alt="Dış poster"')
      expect(html).toMatch(/<button[^>]*type="button"[^>]*>/)
      expect(html).not.toContain('<iframe')
      expect(html).not.toMatch(/vimeo\.com|youtube(-nocookie)?\.com|ytimg/)
    },
  )

  it('shows a Picture for image main media, with no video', async () => {
    const html = await htmlOf('/isler/gorsel-is')
    expect(html).toContain('alt="Kapak"')
    expect(html).not.toContain('<video')
    expect(html).not.toContain('<iframe')
  })
})

describe('details', () => {
  beforeAll(async () => {
    const still = await pages.site.uploadImage(pages.editor, { alt: 'Bir kare' })
    await pages.publishWork({
      title: 'Dolu',
      slug: 'dolu',
      year: 2021,
      disciplines: ['motion', 'grafik'],
      extra: {
        client: 'Acme',
        role: 'Kurgucu',
        credits: [
          { name: 'Ayşe', role: 'Ses' },
          { name: 'Can', role: '' },
        ],
        description: paragraph('Uzun bir açıklama'),
        stills: [{ image: still.id }],
      },
    })
    await pages.publishWork({ title: 'Bos', slug: 'bos', year: 2020 })
  })

  it('shows title, Turkish Disciplines, year, client, role, credits, description and stills', async () => {
    const html = await htmlOf('/isler/dolu')
    expect(html).toMatch(/<h1[^>]*>Dolu<\/h1>/)
    expect(html).toContain('Motion · Grafik')
    expect(html).toContain('2021')
    expect(html).toContain('Acme')
    expect(html).toContain('Kurgucu')
    expect(html).toMatch(/<h2[^>]*>Emeği geçenler<\/h2>/)
    expect(html).toMatch(/Ayşe[\s\S]*Ses/)
    expect(html).toContain('Can')
    expect(html).toContain('Uzun bir açıklama')
    expect(html).toContain('alt="Bir kare"')
  })

  it('renders no empty headings or labels when optional details are empty', async () => {
    const html = await htmlOf('/isler/bos')
    expect(html).toMatch(/<h1[^>]*>Bos<\/h1>/)
    expect(html).not.toContain('Emeği geçenler')
    expect(html).not.toContain('Müşteri')
    expect(html).not.toContain('Rol')
    expect(html).not.toMatch(/<h2[^>]*>\s*<\/h2>/)
    expect(html).not.toContain('Bir kare')
  })
})

describe('next Work', () => {
  it('links to the following Work in list order, and wraps to the first', async () => {
    const { getWorks } = await import('../../../data/works')
    const slugs = (await getWorks()).map((work) => work.slug)
    expect(slugs.length).toBeGreaterThan(1)
    const first = slugs[0]!
    const last = slugs.at(-1)!
    expect(await htmlOf(`/isler/${encodeURIComponent(first)}`)).toContain(
      `href="/isler/${encodeURI(slugs[1]!)}"`,
    )
    expect(await htmlOf(`/isler/${encodeURIComponent(last)}`)).toContain(
      `href="/isler/${encodeURI(first)}"`,
    )
  })
})

describe('slugs', () => {
  it('redirects an old slug permanently to the current one', async () => {
    const created = (await pages.publishWork({ title: 'Eski Ad', slug: 'eski-ad' })) as {
      id: number
    }
    await pages.site.cms.update({
      collection: 'works',
      id: created.id,
      data: { slug: 'yeni-ad', generateSlug: false, _status: 'published' },
      user: pages.editor,
      overrideAccess: false,
    })
    const outcome = await pages.render('/isler/eski-ad')
    expect(outcome).toMatchObject({ kind: 'redirect', permanent: true, target: '/isler/yeni-ad' })
    expect(await htmlOf('/isler/yeni-ad')).toMatch(/<h1[^>]*>Eski Ad<\/h1>/)
  })

  it('is not found for an unknown slug', async () => {
    expect(await pages.render('/isler/yok-boyle-bir-is')).toMatchObject({
      kind: 'not-found',
      status: 404,
    })
  })

  it('prerenders the published slugs', async () => {
    const params = await generateStaticParams()
    expect(params).toContainEqual({ slug: 'dolu' })
  })
})
