import { richTextToPlainText } from '@taha/cms-config'
import { describe, expect, it } from 'vitest'

import { block, doc, paragraphs, textNode } from '../test/lexical'
import { firstParagraph } from './first-paragraph'

describe('firstParagraph', () => {
  it('keeps only the first paragraph', () => {
    const result = firstParagraph(paragraphs('Birinci.', 'İkinci.'))
    expect(richTextToPlainText(result)).toBe('Birinci.')
  })

  it('skips blank paragraphs and headings before the first one with text', () => {
    const bio = doc(
      block('paragraph', [textNode('  ')]),
      block('heading', [textNode('Başlık')], { tag: 'h2' }),
      block('paragraph', [textNode('Asıl metin.')]),
    )
    expect(richTextToPlainText(firstParagraph(bio))).toBe('Asıl metin.')
  })

  it.each([
    ['null', null],
    ['no editor state', 'metin'],
    ['an empty state', doc()],
    ['only blank paragraphs', paragraphs('', ' ')],
  ])('is null for %s', (_name, value) => {
    expect(firstParagraph(value)).toBeNull()
  })
})
