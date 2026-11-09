import type { ImageRead, Seo } from '@taha/cms-config'
import type { Metadata } from 'next'

/**
 * Turns a resolved SEO object (the data module's `seo`) into page metadata: title, description
 * and the share image. Copied once from daglier.com's plumbing (ADR-0100), without its look.
 * The home page passes `home` so its title isn't run through the layout's `%s — name` template.
 */
export function seoToMetadata(seo: Seo<ImageRead>, options: { home?: boolean } = {}): Metadata {
  const { title, description, image } = seo
  const text = description || undefined
  const images = image
    ? [{ url: image.src, width: image.width, height: image.height, alt: image.alt }]
    : undefined
  return {
    title: options.home ? { absolute: title } : title,
    description: text,
    openGraph: { type: 'website', title, description: text, images },
    twitter: { card: image ? 'summary_large_image' : 'summary' },
  }
}
