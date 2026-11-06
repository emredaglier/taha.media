import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getWorks } from '../../data/works'
import { startPageSite, type PageSite } from '../../test/page-html'

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

/** The `<a>` tag of the filter link with this label. */
const filterLink = (html: string, label: string) =>
  new RegExp(`<a[^>]*>${label}</a>`).exec(html)?.[0] ?? ''

describe('with no Works', () => {
  it('shows a short note, under the heading and the filter', async () => {
    const html = await htmlOf('/isler')
    expect(html).toMatch(/<h1[^>]*>İşler<\/h1>/)
    expect(html).toContain('Henüz iş yok.')
  })

  it('says so for a Discipline too', async () => {
    expect(await htmlOf('/isler?disiplin=motion')).toContain('Bu disiplinde henüz iş yok.')
  })
})

describe('with Works', () => {
  beforeAll(async () => {
    const loop = await pages.site.uploadVideo(pages.editor, { use: 'previewLoop' })
    await pages.publishWork({ title: 'Birinci', year: 2023, disciplines: ['kurgu'] })
    await pages.publishWork({ title: 'İkinci', year: 2024, disciplines: ['motion', 'grafik'] })
    await pages.publishWork({
      title: 'Üçüncü',
      slug: 'ucuncu',
      year: 2025,
      disciplines: ['kurgu', 'motion'],
      previewLoop: loop.id,
    })
  })

  it('lists every Work, in the order the data module gives', async () => {
    const html = await htmlOf('/isler')
    const expected = (await getWorks()).map((work) => work.title)
    expect(expected).toHaveLength(3)
    const positions = expected.map((title) => html.indexOf(`>${title}</h2>`))
    expect(positions.every((position) => position > -1)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('shows on each card the title, the Turkish Disciplines, the year and the link', async () => {
    const html = await htmlOf('/isler')
    expect(html).toMatch(/<a[^>]*href="\/isler\/ikinci"[^>]*>[\s\S]*İkinci[\s\S]*Motion · Grafik/)
    expect(html).toMatch(/<a[^>]*href="\/isler\/ikinci"[^>]*>[\s\S]*2024/)
    expect(html).toMatch(/<a[^>]*href="\/isler\/birinci"[^>]*>[\s\S]*Birinci[\s\S]*Kurgu<\/p>/)
    expect(html).toMatch(/href="\/isler\/ucuncu"/)
  })

  it('has the poster image of a Preview loop in the HTML, and no video before JavaScript', async () => {
    const html = await htmlOf('/isler')
    const withLoop = (await getWorks()).find((work) => work.previewLoop)!
    expect(html).toContain(`src="${withLoop.previewLoop!.poster.src}"`)
    expect(html).not.toContain('<video')
  })

  it('marks Tümü as the current filter, with links to each Discipline', async () => {
    const html = await htmlOf('/isler')
    expect(filterLink(html, 'Tümü')).toContain('aria-current="page"')
    for (const label of ['Kurgu', 'Motion', 'Grafik']) {
      expect(filterLink(html, label)).not.toContain('aria-current')
    }
    expect(filterLink(html, 'Motion')).toContain('href="/isler?disiplin=motion"')
  })

  it('keeps only the Works of a Discipline, and marks that filter current', async () => {
    const html = await htmlOf('/isler?disiplin=motion')
    expect(html).toContain('>İkinci</h2>')
    expect(html).toContain('>Üçüncü</h2>')
    expect(html).not.toContain('>Birinci</h2>')
    expect(filterLink(html, 'Motion')).toContain('aria-current="page"')
    expect(filterLink(html, 'Tümü')).not.toContain('aria-current')
  })

  it.each(['/isler?disiplin=video', '/isler?disiplin=', '/isler?disiplin=kurgu&disiplin=motion'])(
    'is not found for %s',
    async (url) => {
      expect(await pages.render(url)).toMatchObject({ kind: 'not-found', status: 404 })
    },
  )
})
