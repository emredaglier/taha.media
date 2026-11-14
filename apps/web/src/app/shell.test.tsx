import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { legalLink, menuLinks } from '../lib/nav-links'
import { startPageSite, type PageSite } from '../test/page-html'

let pages: PageSite

beforeAll(async () => {
  pages = await startPageSite()
}, 60_000)

afterAll(async () => {
  await pages?.close()
})

async function htmlOf(url: string) {
  const outcome = await pages.render(url)
  if (outcome.kind === 'redirect') throw new Error(`redirected to ${outcome.target}`)
  return outcome.html
}

describe.each(['/', '/yok-boyle-bir-sayfa'])('the shell around %s', (url) => {
  it('is Turkish and starts with a skip link to main', async () => {
    const html = await htmlOf(url)
    expect(html).toContain('<html lang="tr"')
    expect(html).toMatch(/<a[^>]*href="#main"/)
    expect(html).toMatch(/<main[^>]*id="main"/)
    expect(html.indexOf('href="#main"')).toBeLessThan(html.indexOf('<header'))
  })

  it('has the header, whose name links Home', async () => {
    const html = await htmlOf(url)
    expect(html).toMatch(
      /<header[\s\S]*<a[^>]*href="\/"[^>]*>Taha Çiftçi<\/a>[\s\S]*creative director/,
    )
  })

  it('holds the route in one page sheet box after the header', async () => {
    const html = await htmlOf(url)
    const box = html.indexOf('id="page-sheet"')
    expect(box).toBeGreaterThan(html.indexOf('</header>'))
    expect(html.indexOf('<main')).toBeGreaterThan(box)
    expect(html.indexOf('href="#main"')).toBeLessThan(box)
    expect(html).toMatch(/<div id="page-sheet" class="flex flex-1 flex-col">/)
  })

  it('has the menu links in the server HTML, so they work without JavaScript', async () => {
    const html = await htmlOf(url)
    const details = /<details[\s\S]*<\/details>/.exec(html)?.[0] ?? ''
    expect(details).toMatch(/<summary[^>]*aria-controls="site-menu-panel"/)
    for (const { href, label } of menuLinks) {
      expect(details).toMatch(new RegExp(`<a[^>]*href="${href}"[^>]*>${label}</a>`))
    }
  })

  it('has Gizlilik and © in the menu, after the page links', async () => {
    const html = await htmlOf(url)
    const details = /<details[\s\S]*<\/details>/.exec(html)?.[0] ?? ''
    const legal = details.indexOf(`href="${legalLink.href}"`)
    expect(details).toMatch(
      new RegExp(`<a[^>]*href="${legalLink.href}"[^>]*>${legalLink.label}</a>`),
    )
    expect(legal).toBeGreaterThan(details.indexOf(`href="${menuLinks.at(-1)!.href}"`))
    expect(details.indexOf(COPYRIGHT)).toBeGreaterThan(legal)
  })
})

const COPYRIGHT = '© Taha Çiftçi'

describe('the footer', () => {
  beforeAll(async () => {
    await pages.publishWork({ title: 'Bir İş', slug: 'bir-is' })
  })

  it('is not on Home, which holds the screen (ADR-0103)', async () => {
    const html = await htmlOf('/')
    expect(html).not.toContain('<footer')
    expect(html.match(/<main[\s>]/g)).toHaveLength(1)
    expect(html).toMatch(/<main[^>]*id="main"/)
  })

  it.each(['/isler', '/isler/bir-is', '/galeri', '/hakkimda', '/gizlilik'])(
    'follows the main content of %s, with the year and the Gizlilik link',
    async (url) => {
      const html = await htmlOf(url)
      expect(html.match(/<footer[\s>]/g)).toHaveLength(1)
      expect(html.match(/<main[\s>]/g)).toHaveLength(1)
      expect(html).toMatch(/<\/main>\s*<footer/)
      expect(html).toContain(COPYRIGHT)
      expect(html).toMatch(/<footer[\s\S]*<a[^>]*href="\/gizlilik"[^>]*>Gizlilik<\/a>/)
    },
  )

  it('is on the not-found page', async () => {
    const outcome = await pages.render('/yok-boyle-bir-sayfa')
    expect(outcome.kind).toBe('not-found')
    if (outcome.kind !== 'not-found') return
    expect(outcome.html.match(/<footer[\s>]/g)).toHaveLength(1)
    expect(outcome.html).toMatch(/<\/main>\s*<footer/)
    expect(outcome.html).toMatch(/<footer[\s\S]*<a[^>]*href="\/gizlilik"[^>]*>Gizlilik<\/a>/)
  })

  it('is on the not-found page of a Work that does not exist', async () => {
    const outcome = await pages.render('/isler/yok-boyle-bir-is')
    expect(outcome.kind).toBe('not-found')
    if (outcome.kind !== 'not-found') return
    expect(outcome.html).toContain('<footer')
  })
})

describe('an unknown path', () => {
  it('renders the not-found page with status 404 and a link Home', async () => {
    const outcome = await pages.render('/yok-boyle-bir-sayfa')
    expect(outcome.kind).toBe('not-found')
    expect(outcome.status).toBe(404)
    if (outcome.kind !== 'not-found') return
    expect(outcome.html).toMatch(/<main[^>]*>[\s\S]*<a[^>]*href="\/"[^>]*>Ana sayfaya dön<\/a>/)
  })

  it('also covers nested unknown paths', async () => {
    expect((await pages.render('/isler/yok/bile')).kind).toBe('not-found')
  })
})
