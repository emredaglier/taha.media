import { describe, expect, it } from 'vitest'

import { expectedTitle, parseManifest, publicRoutes } from './manifest.ts'

const valid = () => ({
  works: [
    { slug: 'a', title: 'A', featured: true },
    { slug: 'b', title: 'B', featured: false },
    { slug: 'c-yeni', title: 'C', featured: false },
  ],
  draft: { slug: 'taslak', title: 'Taslak' },
  renamed: { oldSlug: 'c', newSlug: 'c-yeni', title: 'C' },
  liveEdit: { slug: 'a', title: 'A', newTitle: 'A (canlı)' },
  about: { text: 'Merhaba, ben Taha.' },
  privacy: { text: 'Gizlilik Politikası' },
  gallery: { captions: ['Setten bir döngü', 'İstanbul, sabah'] },
})

describe('parseManifest', () => {
  it('accepts what `pnpm smoke:prepare` writes', () => {
    expect(parseManifest(valid()).works).toHaveLength(3)
  })

  // The gate must never pass for lack of content: an empty or half-written manifest is an error.
  it.each([
    ['no object', null],
    ['no Works', { ...valid(), works: [] }],
    ['no featured Work', { ...valid(), works: [{ slug: 'b', title: 'B', featured: false }] }],
    ['a Work without a slug', { ...valid(), works: [{ slug: '', title: 'A', featured: true }] }],
    ['no draft', { ...valid(), draft: undefined }],
    ['a draft that is also published', { ...valid(), draft: { slug: 'a', title: 'A' } }],
    [
      'a renamed Work that is not published',
      { ...valid(), renamed: { ...valid().renamed, newSlug: 'zzz' } },
    ],
    [
      'a renamed Work that kept its slug',
      { ...valid(), renamed: { ...valid().renamed, oldSlug: 'c-yeni' } },
    ],
    [
      'a live edit on a Work that is not featured',
      { ...valid(), liveEdit: { slug: 'b', title: 'B', newTitle: 'B2' } },
    ],
    [
      'a live edit that changes nothing',
      { ...valid(), liveEdit: { slug: 'a', title: 'A', newTitle: 'A' } },
    ],
    ['no About text', { ...valid(), about: { text: '' } }],
    ['no Privacy text', { ...valid(), privacy: { text: ' ' } }],
    ['no Gallery section', { ...valid(), gallery: undefined }],
    ['no Gallery caption', { ...valid(), gallery: { captions: [] } }],
    ['a blank Gallery caption', { ...valid(), gallery: { captions: ['Bir', ' '] } }],
  ])('refuses %s', (_name, manifest) => {
    expect(() => parseManifest(manifest)).toThrow(/smoke manifest/i)
  })
})

describe('publicRoutes', () => {
  const manifest = parseManifest(valid())

  it('lists Home, İşler with a filter, Galeri, About, Privacy and one page per published Work', () => {
    expect(publicRoutes(manifest).map((route) => route.path)).toEqual([
      '/',
      '/isler',
      '/isler?disiplin=motion',
      '/galeri',
      '/hakkimda',
      '/gizlilik',
      '/isler/a',
      '/isler/b',
      '/isler/c-yeni',
    ])
  })

  it('expects each Work page to show its title, the live-edited one under its new title', () => {
    const titles = Object.fromEntries(
      publicRoutes(manifest)
        .filter((route) => route.path.startsWith('/isler/'))
        .map((route) => [route.path, route.text]),
    )
    expect(titles).toEqual({ '/isler/a': 'A (canlı)', '/isler/b': 'B', '/isler/c-yeni': 'C' })
  })

  it('expects Home to show every featured Work, Galeri every caption, and the pages their seeded text', () => {
    const byPath = Object.fromEntries(publicRoutes(manifest).map((route) => [route.path, route]))
    expect(byPath['/']?.featuredTitles).toEqual(['A (canlı)'])
    expect(byPath['/isler']?.workTitles).toEqual(['A (canlı)', 'B', 'C'])
    expect(byPath['/galeri']?.galleryCaptions).toEqual(['Setten bir döngü', 'İstanbul, sabah'])
    expect(byPath['/hakkimda']?.text).toBe('Merhaba, ben Taha.')
    expect(byPath['/gizlilik']?.text).toBe('Gizlilik Politikası')
  })
})

describe('expectedTitle', () => {
  it('is the new title for the live-edited Work and the seeded title for the rest', () => {
    const manifest = parseManifest(valid())
    expect(expectedTitle(manifest, manifest.works[0]!)).toBe('A (canlı)')
    expect(expectedTitle(manifest, manifest.works[1]!)).toBe('B')
  })
})
