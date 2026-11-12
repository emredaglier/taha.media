import { revalidateTag } from 'next/cache'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getGalleryItems } from '../../../data/gallery'
import { fullSizeFile } from '../../../lib/gallery-item'
import { nextCache } from '../../../test/next-cache-fake'
import { startPageSite, type PageSite } from '../../../test/page-html'
import { metadata } from './page'

let pages: PageSite

beforeAll(async () => {
  pages = await startPageSite()
}, 60_000)

afterAll(async () => {
  nextCache.reset()
  await pages?.close()
})

async function galeri() {
  const outcome = await pages.render('/galeri')
  expect(outcome).toMatchObject({ kind: 'html', status: 200 })
  return outcome.kind === 'html' ? outcome.html : ''
}

const save = (data: Record<string, unknown>) =>
  pages.site.cms.create({
    collection: 'gallery',
    data: data as never,
    user: pages.editor,
    overrideAccess: false,
  })

const HEADING = /<h1[^>]*>Galeri<\/h1>/

describe('with an empty Gallery', () => {
  it('shows the heading and a short Turkish note, and no grid', async () => {
    const html = await galeri()
    expect(html).toMatch(HEADING)
    expect(html).toContain('Galeri henüz boş.')
    expect(html).not.toContain('<figure')
    expect(html).not.toContain('<img')
  })

  it('is titled Galeri', () => {
    expect(metadata).toMatchObject({ title: 'Galeri' })
  })
})

describe('with Gallery items', () => {
  beforeAll(async () => {
    const poster = await pages.site.uploadImage(pages.editor, { alt: 'Döngü kapağı' })
    const loop = await pages.site.uploadVideo(pages.editor, { use: 'gallery', poster: poster.id })
    const sabah = await pages.site.uploadImage(pages.editor, { alt: 'İstanbul sabahı' })
    // Wide enough for the largest size (2560), which is the full-size file.
    const plain = await pages.site.uploadImage(pages.editor, {
      alt: 'Sade görsel',
      width: 2560,
      height: 1707,
    })
    // The newest item comes first: the page lists C, B, A.
    await save({ kind: 'loop', video: loop.id, caption: 'Setten bir döngü', year: 2025 })
    await save({ kind: 'image', image: sabah.id, caption: 'İstanbul, sabah', year: 2025 })
    await save({ kind: 'image', image: plain.id })
  })

  it('lists every item in the order the data module gives, images and a loop alike', async () => {
    const html = await galeri()
    const items = await getGalleryItems()
    expect(items.map((item) => item.kind)).toEqual(['image', 'image', 'loop'])
    const positions = items.map((item) => html.indexOf(`href="${fullSizeFile(item)}"`))
    expect(positions.every((position) => position > -1)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(html.match(/<figure/g)).toHaveLength(3)
  })

  it('shows an item its caption and year, and only what is set', async () => {
    const html = await galeri()
    expect(html).toMatch(/<figcaption[^>]*>Setten bir döngü · 2025<\/figcaption>/)
    expect(html).toMatch(/<figcaption[^>]*>İstanbul, sabah · 2025<\/figcaption>/)
    // The third item has neither, so it has no caption element at all.
    expect(html.match(/<figcaption/g)).toHaveLength(2)
    expect(html).not.toMatch(/>\s*(null|undefined)\s*</)
  })

  it('links each item to its full-size file, which is a link and not a script', async () => {
    const html = await galeri()
    const [plain, sabah, loop] = await getGalleryItems()
    expect(plain?.kind === 'image' && plain.image.fullSrc).toMatch(/-2560x\d+\.webp$/)
    expect(html).toMatch(new RegExp(`<a[^>]*href="${fullSizeFile(plain!)}"`))
    expect(html).toMatch(new RegExp(`<a[^>]*href="${fullSizeFile(sabah!)}"`))
    // A loop links to its MP4.
    expect(loop?.kind === 'loop' && loop.video.src).toMatch(/\.mp4$/)
    expect(html).toMatch(new RegExp(`<a[^>]*href="${fullSizeFile(loop!)}"`))
  })

  it('shows an image as a picture and a loop as its poster, with no video before JavaScript', async () => {
    const html = await galeri()
    const [plain, , loop] = await getGalleryItems()
    // The picture in the grid is a smaller size than the file the link opens.
    const shown = plain?.kind === 'image' ? plain.image : undefined
    expect(html).toContain(`src="${shown?.src}"`)
    expect(shown?.src).not.toBe(shown?.fullSrc)
    expect(html).toContain('alt="Sade görsel"')
    const poster = loop?.kind === 'loop' ? loop.video.poster : undefined
    expect(html).toContain(`src="${poster?.src}"`)
    expect(html).toContain('alt="Döngü kapağı"')
    expect(html).not.toContain('<video')
  })

  it('renders the lightbox closed: no dialog in the server HTML', async () => {
    expect(await galeri()).not.toContain('role="dialog"')
  })
})

describe('revalidation', () => {
  it('serves the cached page until the gallery tag is revalidated', async () => {
    nextCache.reset()
    nextCache.caching = true
    try {
      expect(await galeri()).not.toContain('Yeni kare')
      const image = await pages.site.uploadImage(pages.editor, { alt: 'Yeni' })
      await save({ kind: 'image', image: image.id, caption: 'Yeni kare' })
      expect(await galeri()).not.toContain('Yeni kare')

      revalidateTag('gallery', { expire: 0 })
      expect(await galeri()).toContain('Yeni kare')
    } finally {
      nextCache.reset()
    }
  })
})
