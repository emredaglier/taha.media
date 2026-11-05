import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestSite, type TestSite } from './testing'

let site: TestSite

beforeAll(async () => {
  site = await createTestSite()
}, 30_000)

afterAll(async () => {
  await site?.close()
})

type EditorField = { editor?: { editorConfig?: { features?: { enabledFeatures?: string[] } } } }

/** The editor features switched on for a Work field, as the admin builds its toolbar from them. */
function featuresOf(fieldName: string): string[] {
  const field = site.cms.collections.works.config.fields.find(
    (f) => 'name' in f && f.name === fieldName,
  ) as EditorField
  return [...(field.editor?.editorConfig?.features?.enabledFeatures ?? [])].sort()
}

describe('the Work description editor', () => {
  it('offers only paragraphs, bold, italic and links', () => {
    // No headings, lists, quotes, uploads, tables, code, alignment or indentation.
    expect(featuresOf('description').filter((key) => key !== 'toolbarInline')).toEqual([
      'bold',
      'italic',
      'link',
      'paragraph',
    ])
  })
})
