import { describe, expect, it } from 'vitest'

import { richTextToPlainText } from './rich-text'
import { excerpt, resolveSeo, SEO_DESCRIPTION_LENGTH } from './seo'

const text = (value: string) => ({ type: 'text', text: value })
const paragraph = (...children: object[]) => ({ type: 'paragraph', children })
const state = (...blocks: object[]) => ({ root: { type: 'root', children: blocks } })

describe('richTextToPlainText', () => {
  it('joins paragraphs with a space and keeps links and bold text inline', () => {
    const value = state(
      paragraph(text('Bir '), { type: 'link', children: [text('kış')] }, text(' reklamı.')),
      paragraph(text('İkinci   paragraf')),
    )
    expect(richTextToPlainText(value)).toBe('Bir kış reklamı. İkinci paragraf')
  })

  it('gives an empty string for an empty or missing value', () => {
    expect(richTextToPlainText(null)).toBe('')
    expect(richTextToPlainText(state(paragraph()))).toBe('')
  })
})

describe('excerpt', () => {
  it('keeps a short text whole', () => {
    expect(excerpt('Kısa bir açıklama.')).toBe('Kısa bir açıklama.')
  })

  it('cuts a long text at a word boundary, within the limit, with an ellipsis', () => {
    const long = 'kelime '.repeat(100)
    const result = excerpt(long)
    expect(result.length).toBeLessThanOrEqual(SEO_DESCRIPTION_LENGTH)
    expect(result.endsWith('kelime…')).toBe(true)
  })
})

describe('resolveSeo', () => {
  const fallbackImage = { id: 1 }
  const toImage = (doc: { id: number }) => ({ id: doc.id + 100 })
  const description = state(paragraph(text('Başlangıç metni.')))
  const base = { title: 'İş Başlığı', description, fallbackImage, toImage: toImage as never }

  it('derives everything when there are no overrides', () => {
    for (const overrides of [undefined, null, {}, { title: '', description: '  ', image: 7 }]) {
      expect(resolveSeo({ ...base, overrides })).toEqual({
        title: 'İş Başlığı',
        description: 'Başlangıç metni.',
        image: fallbackImage,
      })
    }
  })

  it('lets each override win on its own', () => {
    expect(
      resolveSeo({ ...base, overrides: { title: 'Özel başlık', description: 'Özel açıklama' } }),
    ).toEqual({ title: 'Özel başlık', description: 'Özel açıklama', image: fallbackImage })
    expect(resolveSeo({ ...base, overrides: { image: { id: 5 } } }).image).toEqual({ id: 105 })
  })
})
