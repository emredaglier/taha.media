import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const works = vi.hoisted(() => ({ list: [] as { slug: string; title: string }[] }))

vi.mock('../../../../data/works', () => ({
  getWorkBySlug: async (slug: string) => ({
    kind: 'work',
    work: {
      ...works.list.find((each) => each.slug === slug)!,
      disciplines: [],
      year: 2026,
      client: null,
      role: null,
      credits: [],
      description: null,
      stills: [],
      mainMedia: { kind: 'image', image: {} },
    },
  }),
  getWorks: async () => works.list,
}))
vi.mock('../../../../components/Picture', () => ({ Picture: () => null }))

import WorkPage from './page'

const nextOf = async (slugs: string[], slug: string) => {
  works.list = slugs.map((each) => ({ slug: each, title: each }))
  const html = renderToStaticMarkup(await WorkPage({ params: Promise.resolve({ slug }) }))
  return /aria-label="Sonraki iş"[^>]*><a[^>]*href="\/isler\/([^"]+)"/.exec(html)?.[1] ?? null
}

describe('the next Work link', () => {
  it('goes to the following Work, and wraps from the last to the first', async () => {
    expect(await nextOf(['a', 'b', 'c'], 'a')).toBe('b')
    expect(await nextOf(['a', 'b', 'c'], 'c')).toBe('a')
  })

  it('is absent with fewer than two Works', async () => {
    expect(await nextOf(['a'], 'a')).toBeNull()
  })
})
