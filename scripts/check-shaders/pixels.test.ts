import { describe, expect, it } from 'vitest'

import { judge, pixelStats, summary, type Observation } from './pixels.ts'

/** RGBA bytes from pixels written as [r, g, b, a]. */
const rgba = (...pixels: [number, number, number, number][]) => new Uint8Array(pixels.flat())

const CLEAR = rgba([0, 0, 0, 0], [0, 0, 0, 0])
const CARD = rgba([0, 0, 0, 0], [40, 80, 120, 255], [10, 10, 10, 128])

describe('pixelStats', () => {
  it('counts the pixels with any coverage and the biggest alpha', () => {
    expect(pixelStats(CARD)).toMatchObject({ total: 3, opaque: 2, maxAlpha: 255 })
    expect(pixelStats(CLEAR)).toMatchObject({ total: 2, opaque: 0, maxAlpha: 0 })
  })

  it('accepts premultiplied colour: no channel above its alpha', () => {
    expect(pixelStats(CARD).invalidPremultiplied).toBe(0)
  })

  it('counts a pixel whose colour channel is above its alpha, however it got there', () => {
    // The final composite writing vec4(1.0, 0.0, 0.0, 0.0), and a half-covered pixel too bright.
    const bad = rgba([255, 0, 0, 0], [0, 200, 0, 128], [0, 0, 0, 255])
    expect(pixelStats(bad).invalidPremultiplied).toBe(2)
  })

  it('allows one level of rounding between a channel and its alpha', () => {
    expect(pixelStats(rgba([129, 129, 129, 128])).invalidPremultiplied).toBe(0)
    expect(pixelStats(rgba([130, 0, 0, 128])).invalidPremultiplied).toBe(1)
  })
})

const GOOD: Observation = {
  glErrors: { frames: 0, empty: 0 },
  cards: { total: 4, opaque: 3, invalidPremultiplied: 0, maxAlpha: 255 },
  empty: { total: 4, opaque: 0, invalidPremultiplied: 0, maxAlpha: 0 },
}

describe('judge', () => {
  it('passes a clean run', () => {
    expect(judge(GOOD)).toEqual([])
  })

  it('fails on a GL error after the frames, naming the error', () => {
    const failures = judge({ ...GOOD, glErrors: { frames: 0x0502, empty: 0 } })
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatch(/gl\.getError\(\).*0x502/i)
  })

  it('fails on a GL error after the empty scene', () => {
    expect(judge({ ...GOOD, glErrors: { frames: 0, empty: 0x0506 } })).toHaveLength(1)
  })

  it('fails when the card frame has no opaque pixel', () => {
    const cards = { ...GOOD.cards, opaque: 0 }
    expect(judge({ ...GOOD, cards })[0]).toMatch(/no opaque/i)
  })

  it('fails on invalid premultiplied output, with how many pixels', () => {
    const cards = { ...GOOD.cards, invalidPremultiplied: 12 }
    expect(judge({ ...GOOD, cards })[0]).toMatch(/premultipl.*12 of 4/i)
  })

  it('fails when an empty scene leaves any alpha', () => {
    const empty = { ...GOOD.empty, maxAlpha: 3 }
    expect(judge({ ...GOOD, empty })[0]).toMatch(/empty scene.*alpha 3/i)
  })

  it('summarises a pass on one line, with the numbers it saw', () => {
    const line = summary(GOOD)
    expect(line).not.toContain('\n')
    expect(line).toContain('3 of 4')
  })

  it('reports every failure, not only the first', () => {
    const failures = judge({
      glErrors: { frames: 1, empty: 1 },
      cards: { ...GOOD.cards, opaque: 0 },
      empty: { ...GOOD.empty, maxAlpha: 9 },
    })
    expect(failures).toHaveLength(4)
  })
})
