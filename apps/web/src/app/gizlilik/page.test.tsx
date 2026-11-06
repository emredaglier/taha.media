import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { block, BOLD, doc, ITALIC, linkNode, paragraphs, textNode } from '../../test/lexical'
import { startPageSite, type PageSite } from '../../test/page-html'
import { generateMetadata } from './page'

let pages: PageSite

beforeAll(async () => {
  pages = await startPageSite()
}, 60_000)

afterAll(async () => {
  await pages?.close()
})

async function gizlilik() {
  const outcome = await pages.render('/gizlilik')
  expect(outcome).toMatchObject({ kind: 'html', status: 200 })
  return outcome.kind === 'html' ? outcome.html : ''
}

const NOTE = 'Gizlilik metni henüz yayınlanmadı.'
const HEADING = /<h1[^>]*>Gizlilik<\/h1>/

describe('before there is a notice', () => {
  it('renders the heading and the note, not a 404, when nothing is published', async () => {
    const html = await gizlilik()
    expect(html).toMatch(HEADING)
    expect(html).toContain(NOTE)
  })

  it('does the same while only a draft exists', async () => {
    await pages.publishGlobal('privacy', { body: paragraphs('Taslak.') }, 'draft')
    const html = await gizlilik()
    expect(html).toMatch(HEADING)
    expect(html).toContain(NOTE)
    expect(html).not.toContain('Taslak.')
  })

  it('does the same when the published notice is empty', async () => {
    await pages.publishGlobal('privacy', { body: paragraphs('') })
    const html = await gizlilik()
    expect(html).toMatch(HEADING)
    expect(html).toContain(NOTE)
  })
})

describe('the published notice', () => {
  const body = doc(
    block('paragraph', [
      textNode('Düz '),
      textNode('kalın', BOLD),
      textNode(' ve '),
      textNode('eğik', ITALIC),
      textNode(' ve '),
      textNode('ikisi', BOLD | ITALIC),
      textNode(' metin, '),
      linkNode('https://example.com/kvkk', 'bir bağlantı'),
      textNode(' ve '),
      linkNode('https://example.com/yeni', 'yeni sekme', true),
      textNode('.'),
    ]),
    block('heading', [textNode('Veriler')], { tag: 'h2' }),
    block('heading', [textNode('Çerezler')], { tag: 'h3' }),
    block(
      'list',
      [
        block('listitem', [textNode('Çerez yok')], { value: 1 }),
        block('listitem', [textNode('İzleme yok')], { value: 2 }),
      ],
      { listType: 'bullet', tag: 'ul' },
    ),
    block('list', [block('listitem', [textNode('Birinci')], { value: 1 })], {
      listType: 'number',
      tag: 'ol',
    }),
    block('paragraph', [linkNode('javascript:alert(1)', 'tehlikeli')]),
  )

  beforeAll(async () => {
    await pages.publishGlobal('privacy', { body })
  })

  it('renders each node type as its semantic element', async () => {
    const html = await gizlilik()
    expect(html).toMatch(HEADING)
    expect(html).not.toContain(NOTE)
    expect(html).toMatch(/<p[^>]*>.*Düz /)
    expect(html).toMatch(/<strong>kalın<\/strong>/)
    expect(html).toMatch(/<em>eğik<\/em>/)
    expect(html).toMatch(/<em><strong>ikisi<\/strong><\/em>/)
    expect(html).toMatch(/<a[^>]*href="https:\/\/example.com\/kvkk"[^>]*>bir bağlantı<\/a>/)
    expect(html).toMatch(/<h2[^>]*>Veriler<\/h2>/)
    expect(html).toMatch(/<h3[^>]*>Çerezler<\/h3>/)
    expect(html).toMatch(/<ul[^>]*><li>Çerez yok<\/li><li>İzleme yok<\/li><\/ul>/)
    expect(html).toMatch(/<ol[^>]*><li>Birinci<\/li><\/ol>/)
  })

  it('opens a new-tab link safely, and leaves other links in the same tab', async () => {
    const html = await gizlilik()
    expect(html).toMatch(
      /<a[^>]*href="https:\/\/example.com\/yeni"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/,
    )
    expect(html).not.toMatch(/href="https:\/\/example.com\/kvkk"[^>]*target=/)
  })

  it('keeps the text of a link with an unsafe address but not the link', async () => {
    const html = await gizlilik()
    expect(html).toContain('tehlikeli')
    expect(html).not.toContain('javascript:')
  })
})

describe('metadata', () => {
  it('takes title and description from the Privacy SEO overrides', async () => {
    await pages.publishGlobal('privacy', {
      body: paragraphs('Bir şey.'),
      seo: { title: 'Gizlilik Politikası', description: 'Ziyaretçiden veri toplanmaz.' },
    })
    const metadata = await generateMetadata()
    expect(metadata.title).toBe('Gizlilik Politikası')
    expect(metadata.description).toBe('Ziyaretçiden veri toplanmaz.')
  })

  it('falls back to the page name and the start of the text', async () => {
    await pages.publishGlobal('privacy', {
      body: paragraphs('Bu site hiçbir veri toplamaz.'),
      seo: { title: '', description: '' },
    })
    const metadata = await generateMetadata()
    expect(metadata.title).toBe('Gizlilik')
    expect(metadata.description).toBe('Bu site hiçbir veri toplamaz.')
  })
})
