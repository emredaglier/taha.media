import type { ImageRead, VideoRead } from '@taha/cms-config'
import { describe, expect, it } from 'vitest'

import type { GalleryItem } from '../data/gallery'
import { captionLine, fullSizeFile, gridPicture, mediaSize } from './gallery-item'

const picture = (id: number): ImageRead => ({
  id,
  src: `/img/${id}-1280.webp`,
  srcset: '',
  width: 3000,
  height: 2000,
  focalPoint: { x: 50, y: 50 },
  alt: `Görsel ${id}`,
})

const video: VideoRead = {
  id: 7,
  src: '/video/7.mp4',
  width: 1080,
  height: 1920,
  duration: 8,
  hasAudio: false,
  poster: picture(70),
}

type Text = { caption?: string | null; year?: number | null }

const image = ({ caption = null, year = null }: Text = {}): GalleryItem => ({
  id: 1,
  kind: 'image',
  caption,
  year,
  image: { ...picture(1), fullSrc: '/img/1-2560.webp' },
})

const loop = ({ caption = null, year = null }: Text = {}): GalleryItem => ({
  id: 2,
  kind: 'loop',
  caption,
  year,
  video,
})

describe('fullSizeFile', () => {
  it('is the largest picture for an image and the MP4 for a loop', () => {
    expect(fullSizeFile(image())).toBe('/img/1-2560.webp')
    expect(fullSizeFile(loop())).toBe('/video/7.mp4')
  })
})

describe('gridPicture', () => {
  it('is the picture itself for an image and the poster for a loop', () => {
    expect(gridPicture(image()).id).toBe(1)
    expect(gridPicture(loop()).id).toBe(70)
  })
})

describe('mediaSize', () => {
  it('is the stored width and height, which reserve the lightbox frame', () => {
    expect(mediaSize(image())).toEqual({ width: 3000, height: 2000 })
    expect(mediaSize(loop())).toEqual({ width: 1080, height: 1920 })
  })
})

describe('captionLine', () => {
  it('joins the caption and the year, and shows what is set', () => {
    expect(captionLine(image({ caption: 'Set günü', year: 2025 }))).toBe('Set günü · 2025')
    expect(captionLine(image({ caption: 'Set günü' }))).toBe('Set günü')
    expect(captionLine(loop({ year: 2024 }))).toBe('2024')
  })

  it('is null when neither is set, so nothing empty is rendered', () => {
    expect(captionLine(image())).toBeNull()
  })
})
