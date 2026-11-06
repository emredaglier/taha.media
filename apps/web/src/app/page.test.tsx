import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getSite } from '../data/pages'
import { paragraphs } from '../test/lexical'
import { startPageSite, type PageSite } from '../test/page-html'

let pages: PageSite

beforeAll(async () => {
  pages = await startPageSite()
}, 60_000)

afterAll(async () => {
  await pages?.close()
})

async function home() {
  const outcome = await pages.render('/')
  expect(outcome).toMatchObject({ kind: 'html', status: 200 })
  return outcome.kind === 'html' ? outcome.html : ''
}

const slotsIn = (html: string) => [...html.matchAll(/data-slot="([ABC])"/g)].map((m) => m[1])

describe('with nothing published', () => {
  it('still shows the name as the heading, in the Turkish shell', async () => {
    const html = await home()
    expect(html).toContain('<html lang="tr"')
    expect(html).toMatch(/<h1[^>]*>Taha Çiftçi<\/h1>/)
  })

  it('has no Featured Works section, no All works link and no short About', async () => {
    const html = await home()
    expect(slotsIn(html)).toEqual([])
    expect(html).not.toContain('Tüm işler')
    expect(html).not.toContain('about-heading')
  })
})

describe('the hero', () => {
  it('shows the name and the intro on a plain block with no Showreel at all', async () => {
    await pages.publishGlobal('site', { intro: 'Kurgu, hareket ve grafik.' })
    const html = await home()
    expect(html).toContain('Kurgu, hareket ve grafik.')
    expect(html).not.toContain('<video')
    expect(html).not.toContain('Sesli izle')
  })

  it('puts the poster of the Showreel in the HTML, with no "watch with sound" without a link', async () => {
    const reel = await pages.site.uploadVideo(pages.editor, { use: 'showreel' })
    await pages.publishGlobal('site', { intro: 'Kurgu, hareket ve grafik.', showreel: reel.id })
    const html = await home()
    const poster = (await getSite())!.showreel!.poster
    expect(html).toContain(`src="${poster.src}"`)
    expect(html).not.toContain('Sesli izle')
  })

  it('has both variants in the HTML when there is a phone variant', async () => {
    const reel = await pages.site.uploadVideo(pages.editor, { use: 'showreel' })
    const phone = await pages.site.uploadVideo(pages.editor, { use: 'showreel' })
    await pages.publishGlobal('site', { showreel: reel.id, showreelPhone: phone.id })
    const site = (await getSite())!
    const html = await home()
    expect(html).toContain(`src="${site.showreel!.poster.src}"`)
    expect(html).toContain(`src="${site.showreelPhone!.poster.src}"`)
  })

  it('offers "watch with sound" as a link when the full-length Showreel is set, and loads nothing third-party', async () => {
    await pages.publishGlobal('site', {
      showreelLink: { url: 'https://vimeo.com/123456789' },
    })
    const html = await home()
    expect(html).toMatch(/<a[^>]*href="https:\/\/vimeo\.com\/123456789"[^>]*>Sesli izle<\/a>/)
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('player.vimeo.com')
  })

  it('shows only the poster picture, with no video, when there is a poster but no loop', async () => {
    const poster = await pages.site.uploadImage(pages.editor, { alt: 'Showreel kapağı' })
    await pages.publishGlobal('site', {
      showreel: null,
      showreelPhone: null,
      showreelPoster: poster.id,
    })
    const html = await home()
    expect(html).not.toContain('<video')
    expect(html).toContain('alt="Showreel kapağı"')
  })
})

describe('the Featured Works', () => {
  const feature = (title: string, featuredOrder: number) =>
    pages.publishWork({ title, extra: { featured: true, featuredOrder } })

  it('are left out, with no link, when no Work is featured', async () => {
    await pages.publishWork({ title: 'Öne çıkmayan' })
    const html = await home()
    expect(slotsIn(html)).toEqual([])
    expect(html).not.toContain('Tüm işler')
  })

  it('show one card in slot A with the All works link', async () => {
    await feature('Bir', 1)
    const html = await home()
    expect(slotsIn(html)).toEqual(['A'])
    expect(html).toMatch(/<a[^>]*href="\/isler"[^>]*>Tüm işler<\/a>/)
    expect(html).not.toContain('Öne çıkmayan')
  })

  it('fill A, B and C with three, in featured order, each linking to its Work', async () => {
    await feature('İki', 2)
    await feature('Üç', 3)
    const html = await home()
    expect(slotsIn(html)).toEqual(['A', 'B', 'C'])
    const titles = ['Bir', 'İki', 'Üç'].map((title) => html.indexOf(`>${title}</h3>`))
    expect(titles.every((position) => position > -1)).toBe(true)
    expect(titles).toEqual([...titles].sort((a, b) => a - b))
    expect(html).toMatch(/<a[^>]*href="\/isler\/bir"/)
  })

  it('start a second group with the fourth, again in slot A', async () => {
    await feature('Dört', 4)
    const html = await home()
    expect(slotsIn(html)).toEqual(['A', 'B', 'C', 'A'])
  })

  it('show the Disciplines and the client on each card', async () => {
    await pages.publishWork({
      title: 'Müşterili',
      disciplines: ['motion', 'grafik'],
      extra: { featured: true, featuredOrder: 5, client: 'Mavi Saat' },
    })
    const html = await home()
    expect(html).toContain('Motion · Grafik')
    expect(html).toContain('Mavi Saat')
  })
})

describe('the short About', () => {
  it('is left out while About is unpublished', async () => {
    expect(await home()).not.toContain('about-heading')
  })

  it('shows the portrait and only the first paragraph, linking to the full page', async () => {
    const portrait = await pages.site.uploadImage(pages.editor, { alt: 'Taha portresi' })
    await pages.publishGlobal('about', {
      portrait: portrait.id,
      bio: paragraphs('İlk paragraf.', 'İkinci paragraf.'),
    })
    const html = await home()
    expect(html).toContain('alt="Taha portresi"')
    expect(html).toContain('İlk paragraf.')
    expect(html).not.toContain('İkinci paragraf.')
    expect(html).toMatch(/<a[^>]*href="\/hakkimda"/)
  })
})
