import { describe, expect, it } from 'vitest'

import { toImage } from './image-read'
import type { Image } from './payload-types'

const doc = {
  id: 7,
  alt: 'Bir kış sahnesi',
  url: 'https://cdn.test/media/original-aaa.webp',
  width: 4000,
  height: 3000,
  focalX: 30,
  focalY: 60,
  updatedAt: '',
  createdAt: '',
  sizes: {
    thumbnail: { url: 'https://cdn.test/media/t.webp', width: 400, height: 400 },
    small: { url: 'https://cdn.test/media/s.webp', width: 800, height: 600 },
    medium: { url: 'https://cdn.test/media/m.webp', width: 1280, height: 960 },
    large: { url: null, width: null, height: null },
    xlarge: { url: 'https://cdn.test/media/x.webp', width: 2560, height: 1920 },
  },
} as Image

describe('toImage', () => {
  it('carries dimensions, focal point and alt', () => {
    expect(toImage(doc)).toMatchObject({
      id: 7,
      width: 4000,
      height: 3000,
      focalPoint: { x: 30, y: 60 },
      alt: 'Bir kış sahnesi',
    })
  })

  it('builds the srcset from the generated sizes only, ascending, never the original or the thumbnail', () => {
    const { srcset } = toImage(doc)
    expect(srcset).toBe(
      'https://cdn.test/media/s.webp 800w, https://cdn.test/media/m.webp 1280w, https://cdn.test/media/x.webp 2560w',
    )
    expect(srcset).not.toContain(doc.url)
    expect(srcset).not.toContain('t.webp')
  })

  it('uses a generated size as src and centres the focal point when none was set', () => {
    const read = toImage({ ...doc, focalX: null, focalY: null })
    expect(read.src).toBe('https://cdn.test/media/m.webp')
    expect(read.focalPoint).toEqual({ x: 50, y: 50 })
  })

  it('falls back to the original as src (never in srcset) when no size was generated', () => {
    const read = toImage({ ...doc, sizes: {} })
    expect(read.srcset).toBe('')
    expect(read.src).toBe(doc.url)
  })
})
