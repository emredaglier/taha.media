import type { Field } from 'payload'

import { richTextToPlainText } from './rich-text'

/** Longest SEO description we derive; search results cut around here anyway. */
export const SEO_DESCRIPTION_LENGTH = 160

/**
 * Optional SEO overrides for a document (spec #1 stories 24 and 41): title, description and share
 * image. All three are optional; whatever is empty falls back at read time (`resolveSeo`).
 * Reusable on the single-entry pages.
 */
export const seoField = (): Field => ({
  name: 'seo',
  label: 'SEO',
  type: 'group',
  admin: { description: 'İsteğe bağlı. Boş bırakılan alanlar otomatik doldurulur.' },
  fields: [
    { name: 'title', label: 'SEO başlığı', type: 'text', localized: true },
    { name: 'description', label: 'SEO açıklaması', type: 'textarea', localized: true },
    { name: 'image', label: 'Paylaşım görseli', type: 'upload', relationTo: 'images' },
  ],
})

/** The start of a text, cut at a word boundary with an ellipsis when it is too long. */
export function excerpt(text: string, maxLength = SEO_DESCRIPTION_LENGTH): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLength) return clean
  const cut = clean.slice(0, maxLength - 1)
  const lastSpace = cut.lastIndexOf(' ')
  // Cut at the last word boundary, unless that would throw away most of the text.
  const base = lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut
  return `${base.replace(/[\s.,;:!?-]+$/, '')}…`
}

export type SeoOverrides =
  { title?: string | null; description?: string | null; image?: unknown } | null | undefined

/** SEO as a read returns it; `image` is whatever the caller maps (an `ImageRead`). */
export type Seo<Image> = { title: string; description: string; image: Image | null }

/**
 * Overrides win when set (non-blank); otherwise the title is the document's own title, the
 * description is the start of its description text, and the image is the fallback (the cover).
 * `toImage` maps a populated override image; an unpopulated one (an id) counts as unset.
 */
export function resolveSeo<Image>({
  overrides,
  title,
  description,
  fallbackImage,
  toImage,
}: {
  overrides: SeoOverrides
  title: string
  /** The document's rich-text description; its start is the fallback description. */
  description: unknown
  fallbackImage: Image | null
  toImage: (doc: never) => Image
}): Seo<Image> {
  const given = (value: string | null | undefined) => (value?.trim() ? value.trim() : undefined)
  const overrideImage = overrides?.image
  return {
    title: given(overrides?.title) ?? title,
    description: given(overrides?.description) ?? excerpt(richTextToPlainText(description)),
    image:
      typeof overrideImage === 'object' && overrideImage !== null
        ? toImage(overrideImage as never)
        : fallbackImage,
  }
}
