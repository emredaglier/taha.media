import type { ImageRead } from '@taha/cms-config'
import { expect, it } from 'vitest'

import { seoToMetadata } from './seo'

const image: ImageRead = {
  id: 1,
  src: 'https://cdn.test/media/a.webp',
  srcset: '',
  width: 1200,
  height: 630,
  focalPoint: { x: 50, y: 50 },
  alt: 'Bir kare',
}

it('carries title, description and the share image', () => {
  const metadata = seoToMetadata({ title: 'Hakkımda', description: 'Kısa bir yazı', image })
  expect(metadata.title).toBe('Hakkımda')
  expect(metadata.description).toBe('Kısa bir yazı')
  expect(metadata.openGraph?.images).toEqual([
    { url: image.src, width: 1200, height: 630, alt: 'Bir kare' },
  ])
  expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' })
})

it('has no image entry and a plain card when there is no image', () => {
  const metadata = seoToMetadata({ title: 'Gizlilik', description: '', image: null })
  expect(metadata.openGraph?.images).toBeUndefined()
  expect(metadata.description).toBeUndefined()
  expect(metadata.twitter).toMatchObject({ card: 'summary' })
})

it('keeps the home title out of the layout template', () => {
  const metadata = seoToMetadata(
    { title: 'taha.media', description: '', image: null },
    { home: true },
  )
  expect(metadata.title).toEqual({ absolute: 'taha.media' })
})
