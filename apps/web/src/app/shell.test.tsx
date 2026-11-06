import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

  it('has the menu links in the server HTML, so they work without JavaScript', async () => {
    const html = await htmlOf(url)
    expect(html).toMatch(/<details[\s\S]*<summary[^>]*aria-controls="site-menu-panel"/)
    for (const [href, label] of [
      ['/isler', 'İşler'],
      ['/galeri', 'Galeri'],
      ['/hakkimda', 'Hakkımda'],
    ]) {
      expect(html).toMatch(new RegExp(`<a[^>]*href="${href}"[^>]*>${label}</a>`))
    }
  })

  it('has the footer with the year and the Gizlilik link', async () => {
    const html = await htmlOf(url)
    expect(html).toContain(`© ${new Date().getFullYear()} Taha Çiftçi`)
    expect(html).toMatch(/<footer[\s\S]*<a[^>]*href="\/gizlilik"/)
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
