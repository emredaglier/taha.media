import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { paragraphs } from '../../../test/lexical'
import { startPageSite, type PageSite } from '../../../test/page-html'
import { generateMetadata } from './page'

let pages: PageSite

beforeAll(async () => {
  pages = await startPageSite()
}, 60_000)

afterAll(async () => {
  await pages?.close()
})

async function hakkimda() {
  const outcome = await pages.render('/hakkimda')
  expect(outcome).toMatchObject({ kind: 'html', status: 200 })
  return outcome.kind === 'html' ? outcome.html : ''
}

const HEADING = /<h1[^>]*>Hakkımda<\/h1>/
const EMPTY_ABOUT = {
  portrait: null,
  bio: paragraphs(''),
  disciplineLines: { kurgu: '', grafik: '', motion: '' },
  clients: [],
}
const EMAIL = 'taha@example.com'
const SOCIALS = [
  { platform: 'Vimeo', url: 'https://vimeo.com/taha' },
  { platform: 'Instagram', url: 'https://instagram.com/taha' },
  { platform: 'Behance', url: 'https://behance.net/taha' },
]

describe('nothing published', () => {
  it('renders only the heading, with no contact heading', async () => {
    const html = await hakkimda()
    expect(html).toMatch(HEADING)
    expect(html).not.toContain('İletişim')
    expect(html).not.toContain('mailto:')
    expect(html).not.toContain('Müşteriler')
    expect(html).not.toContain('<img')
  })

  it('takes the metadata title from the page name', async () => {
    expect(await generateMetadata()).toMatchObject({ title: 'Hakkımda' })
  })
})

describe('About unpublished, Site published', () => {
  beforeAll(async () => {
    await pages.publishGlobal('about', { bio: paragraphs('Taslak biyografi.') }, 'draft')
    await pages.publishGlobal('site', { email: EMAIL, socials: SOCIALS })
  })

  it('still renders the heading and the contact, and not the draft', async () => {
    const html = await hakkimda()
    expect(html).toMatch(HEADING)
    expect(html).toContain('İletişim')
    expect(html).toContain(EMAIL)
    expect(html).not.toContain('Taslak biyografi.')
  })

  it('renders the email as a mailto link', async () => {
    expect(await hakkimda()).toMatch(
      /<a[^>]*href="mailto:taha@example\.com"[^>]*>taha@example\.com<\/a>/,
    )
  })

  it('keeps the socials in the Editor order as plain links', async () => {
    const html = await hakkimda()
    const order = ['Vimeo', 'Instagram', 'Behance'].map((name) => html.indexOf(`>${name}</a>`))
    expect(order.every((i) => i > 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(html).toMatch(/<a[^>]*href="https:\/\/vimeo\.com\/taha"[^>]*>Vimeo<\/a>/)
    expect(html).not.toContain('target="_blank"')
  })
})

describe('Site without email or socials', () => {
  it('omits the contact part, with no empty heading', async () => {
    await pages.publishGlobal('site', { email: '', socials: [] })
    const html = await hakkimda()
    expect(html).toMatch(HEADING)
    expect(html).not.toContain('İletişim')
    expect(html).not.toContain('mailto:')
  })

  it('renders only the socials when there is no email', async () => {
    await pages.publishGlobal('site', { email: '', socials: SOCIALS })
    const html = await hakkimda()
    expect(html).toContain('İletişim')
    expect(html).not.toContain('mailto:')
    expect(html).toContain('>Instagram</a>')
  })

  it('renders only the email when there are no socials', async () => {
    await pages.publishGlobal('site', { email: EMAIL, socials: [] })
    const html = await hakkimda()
    expect(html).toContain('mailto:taha@example.com')
    expect(html).not.toContain('instagram.com')
  })
})

describe('About published with every part empty', () => {
  it('renders just the heading', async () => {
    await pages.publishGlobal('site', { email: '', socials: [] })
    await pages.publishGlobal('about', EMPTY_ABOUT)
    const html = await hakkimda()
    expect(html).toMatch(HEADING)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<dl')
    expect(html).not.toContain('Müşteriler')
    expect(html).not.toContain('İletişim')
  })
})

describe('About published with full content', () => {
  beforeAll(async () => {
    const portrait = await pages.site.uploadImage(pages.editor, { alt: 'Taha portresi' })
    const logo = await pages.site.uploadImage(pages.editor, {
      alt: 'Alfa logosu',
      width: 800,
      height: 800,
    })
    await pages.publishGlobal('site', { email: EMAIL, socials: SOCIALS })
    await pages.publishGlobal('about', {
      portrait: portrait.id,
      bio: paragraphs('Ben Taha, kurgucuyum.', 'İkinci paragraf.'),
      disciplineLines: { grafik: 'Afişler ve kimlikler.', kurgu: 'Reklam ve film.', motion: '' },
      clients: [{ name: 'Zeta' }, { name: 'Alfa', logo: logo.id }, { name: 'Mim' }],
    })
  })

  it('renders the parts in order', async () => {
    const html = await hakkimda()
    const at = [
      '<h1',
      'alt="Taha portresi"',
      'Ben Taha, kurgucuyum.',
      'İkinci paragraf.',
      'Reklam ve film.',
      'Afişler ve kimlikler.',
      'Müşteriler',
      'Zeta',
      'Alfa',
      'Mim',
      'İletişim',
      'mailto:taha@example.com',
    ].map((part) => html.indexOf(part))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect(at).toEqual([...at].sort((a, b) => a - b))
  })

  it('labels each Discipline in Turkish, in Discipline order, and skips ones without a line', async () => {
    const html = await hakkimda()
    expect(html).toMatch(/<dt[^>]*>Kurgu<\/dt><dd[^>]*>Reklam ve film\.<\/dd>/)
    expect(html).toMatch(/<dt[^>]*>Grafik[^<]*<\/dt><dd[^>]*>Afişler ve kimlikler\.<\/dd>/)
    expect(html.match(/<dt/g)).toHaveLength(2)
  })

  it('shows a client logo only when set', async () => {
    const html = await hakkimda()
    expect(html).toContain('alt="Alfa logosu"')
    expect(html.match(/<img/g)).toHaveLength(2)
  })

  it('takes the metadata from the About SEO', async () => {
    expect(await generateMetadata()).toMatchObject({
      title: 'Hakkımda',
      description: 'Ben Taha, kurgucuyum. İkinci paragraf.',
    })
  })
})
