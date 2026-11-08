import { DISCIPLINE_LABELS, type Discipline } from '@taha/cms-config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getSite } from '../data/pages'
import { copyrightNotice, OWNER_NAME } from '../lib/site'
import { startPageSite, type PageSite } from '../test/page-html'

// Like the other page-HTML test files, the describes below build on each other: one site, and
// what an earlier test published stays published for the next. Run the file whole, not with `-t`.
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

const nameHeading = new RegExp(`<h1[^>]*>${OWNER_NAME}</h1>`)

const textOf = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** The hero's visible text: the section around the page's `h1`. */
function heroText(html: string) {
  const heading = html.indexOf('<h1')
  expect(heading).toBeGreaterThan(-1)
  const start = html.lastIndexOf('<section', heading)
  return textOf(html.slice(start, html.indexOf('</section>', start)))
}

/** The cards in page order: the slug each links to, and the card's own HTML. */
function cardsIn(html: string) {
  return [...html.matchAll(/<a[^>]*href="\/isler\/([^"]+)"[^>]*>(.*?)<\/a>/gs)].map((match) => ({
    slug: match[1]!,
    html: match[2]!,
  }))
}

/** The slug `publishWork` gives a Work with this title. */
const slugOf = (title: string) => title.toLowerCase().replaceAll(' ', '-')

const h1Count = (html: string) => html.match(/<h1[\s>]/g)?.length ?? 0

describe('with nothing published', () => {
  it('still shows the name as the heading, in the Turkish shell', async () => {
    const html = await home()
    expect(html).toContain('<html lang="tr"')
    expect(html).toMatch(nameHeading)
  })

  it('has no Featured Works section, no All works link and no short About', async () => {
    const html = await home()
    expect(cardsIn(html)).toEqual([])
    expect(html).not.toContain('Öne çıkan işler')
    expect(html).not.toContain('Tüm işler')
    expect(html).not.toContain('about-heading')
  })
})

describe('the hero', () => {
  it('shows the name with © under it, and no Statement while it is blank', async () => {
    await pages.publishGlobal('site', { statement: '   ' })
    const html = await home()
    expect(heroText(html)).toBe(`${OWNER_NAME} ${copyrightNotice()}`)
    expect(html).not.toContain('<video')
    expect(html).not.toContain('Sesli izle')
  })

  it('shows the Statement after the name and ©, on a plain block with no Showreel at all', async () => {
    await pages.publishGlobal('site', { statement: 'Kurgu, hareket ve grafik.' })
    const html = await home()
    expect(heroText(html)).toBe(`${OWNER_NAME} ${copyrightNotice()} Kurgu, hareket ve grafik.`)
    expect(html).not.toContain('<video')
    expect(html).not.toContain('Sesli izle')
  })

  it('puts the poster of the Showreel in the HTML, with no "watch with sound" without a link', async () => {
    const reel = await pages.site.uploadVideo(pages.editor, { use: 'showreel' })
    await pages.publishGlobal('site', { statement: 'Kurgu, hareket ve grafik.', showreel: reel.id })
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
  // The CMS refuses to publish a featured Work without a 16:9 Preview loop (backend #43).
  let loopId: number | undefined
  const previewLoop = async () =>
    (loopId ??= (await pages.site.uploadVideo(pages.editor, { use: 'previewLoop' })).id)

  /** What each featured Work was published with, so a card is checked against its own Work. */
  const disciplinesOf = new Map<string, Discipline[]>()
  const feature = async (title: string, featuredOrder: number) => {
    // Odd and even Works differ, so a card showing another Work's Disciplines is caught.
    const disciplines: Discipline[] = featuredOrder % 2 === 0 ? ['kurgu'] : ['motion', 'grafik']
    disciplinesOf.set(title, disciplines)
    await pages.publishWork({
      title,
      previewLoop: await previewLoop(),
      disciplines,
      extra: { featured: true, featuredOrder, client: `Müşteri ${title}` },
    })
  }

  /** Older data: a featured Work whose loop is gone, which the CMS would refuse to publish now. */
  const featureWithoutLoop = async (title: string, featuredOrder: number) => {
    await feature(title, featuredOrder)
    // The title is localized, so it is not a column of `works`; the slug is.
    await pages.site.cmsClient().execute({
      sql: 'UPDATE works SET preview_loop_id = NULL WHERE slug = ?',
      args: [slugOf(title)],
    })
  }

  /** The Works on Home, in order: each card must carry its own title, Disciplines and client. */
  const expectCards = (html: string, titles: string[]) => {
    const cards = cardsIn(html)
    expect(cards.map((card) => card.slug)).toEqual(titles.map(slugOf))
    cards.forEach((card, index) => {
      const title = titles[index]!
      const disciplines = disciplinesOf
        .get(title)!
        .map((discipline) => DISCIPLINE_LABELS[discipline])
      expect(card.html).toMatch(new RegExp(`<h3[^>]*>${title}</h3>`))
      expect(card.html).toContain(`<p>${disciplines.join(' · ')}</p>`)
      expect(card.html).toContain(`Müşteri ${title}`)
    })
  }

  it('are left out, with no link, when no Work is featured', async () => {
    await pages.publishWork({ title: 'Öne çıkmayan' })
    const html = await home()
    expect(cardsIn(html)).toEqual([])
    expect(html).not.toContain('Öne çıkan işler')
    expect(html).not.toContain('Tüm işler')
  })

  it('leave the hero alone, with no cards section, when the only featured Work has no Preview loop', async () => {
    await featureWithoutLoop('Eski', 1)
    const html = await home()
    expect(html).not.toContain('Eski')
    expect(cardsIn(html)).toEqual([])
    expect(html).not.toContain('Öne çıkan işler')
    expect(html).toMatch(nameHeading)
  })

  it('show one card with its title, Disciplines and client, linking to its Work', async () => {
    await feature('Bir', 2)
    const html = await home()
    expectCards(html, ['Bir'])
    expect(html).not.toContain('Öne çıkmayan')
    expect(html).not.toContain('Tüm işler')
  })

  it('show three in the Editor’s order, not the order they were created in', async () => {
    await feature('Uc', 4)
    await feature('Iki', 3)
    const html = await home()
    expectCards(html, ['Bir', 'Iki', 'Uc'])
  })

  it('show twelve in the Editor’s order, and still leave out the Work without a loop', async () => {
    const extraTitles = Array.from(
      { length: 9 },
      (_, index) => `Is ${String(index + 1).padStart(2, '0')}`,
    )
    // Created in reverse, so the page order can only come from the Editor's order.
    for (const [index, title] of [...extraTitles.entries()].reverse()) {
      await feature(title, 10 + index)
    }
    const html = await home()
    expectCards(html, ['Bir', 'Iki', 'Uc', ...extraTitles])
    expect(html).not.toContain('Eski')
    expect(html).not.toContain('Tüm işler')
  })

  it('keep the name as the only h1, with twelve cards on the page', async () => {
    expect(h1Count(await home())).toBe(1)
  })

  it('come with the whole Home in the server HTML, so no script is needed to read it', async () => {
    // Whether anything is hidden is look and layout, which the owner checks with JavaScript off
    // (CODING_STANDARDS: Tests). What this holds is that every part is in the HTML itself.
    const reel = await pages.site.uploadVideo(pages.editor, { use: 'showreel' })
    const phone = await pages.site.uploadVideo(pages.editor, { use: 'showreel' })
    await pages.publishGlobal('site', {
      showreel: reel.id,
      showreelPhone: phone.id,
      showreelLink: { url: 'https://vimeo.com/123456789' },
    })
    const site = (await getSite())!
    const html = await home()
    expect(cardsIn(html)).toHaveLength(12)
    expect(heroText(html)).toBe(
      `${OWNER_NAME} ${copyrightNotice()} Kurgu, hareket ve grafik. Sesli izle`,
    )
    expect(html).toContain(`src="${site.showreel!.poster.src}"`)
    expect(html).toContain(`src="${site.showreelPhone!.poster.src}"`)
  })

  it('add no Helix to the server HTML: it mounts only in the browser, after the capability check', async () => {
    const html = await home()
    expect(html).not.toContain('<canvas')
    // The mark that hides the static Home is set by JavaScript alone, once the Helix runs.
    expect(html).not.toMatch(/data-home=/)
  })
})

describe('the parts Home no longer has', () => {
  it('has no short About and no All works link, with a published About and cards on the page', async () => {
    const portrait = await pages.site.uploadImage(pages.editor, { alt: 'Taha portresi' })
    await pages.publishGlobal('about', { portrait: portrait.id })
    const html = await home()
    expect(cardsIn(html).length).toBeGreaterThan(0)
    expect(html).not.toContain('about-heading')
    expect(html).not.toContain('Taha portresi')
    expect(html).not.toContain('Tüm işler')
    expect(html).not.toMatch(/<a[^>]*href="\/hakkimda"[^>]*>Daha fazlası/)
  })
})
