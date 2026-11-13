import { describe, expect, it } from 'vitest'

import {
  judge,
  MIN_CARD_COVERAGE,
  MIN_ROOM_LIT,
  pixelStats,
  roomStats,
  summary,
  type Observation,
} from './pixels.ts'

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
  glErrors: { frames: 0, empty: 0, room: 0 },
  cards: { total: 4, opaque: 3, invalidPremultiplied: 0, maxAlpha: 255 },
  empty: { total: 4, opaque: 0, invalidPremultiplied: 0, maxAlpha: 0 },
  room: { total: 4, lit: 3 },
}

describe('roomStats', () => {
  it('counts the pixels with any colour, however dim, and not the black ones', () => {
    expect(roomStats(rgba([0, 0, 0, 255], [0, 1, 0, 255], [9, 9, 9, 255]))).toEqual({
      total: 3,
      lit: 2,
    })
  })
})

describe('judge', () => {
  it('passes a clean run', () => {
    expect(judge(GOOD)).toEqual([])
  })

  it('fails on a GL error after the frames, naming the error', () => {
    const failures = judge({ ...GOOD, glErrors: { frames: 0x0502, empty: 0, room: 0 } })
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatch(/gl\.getError\(\).*0x502/i)
  })

  it('fails on a GL error after the empty scene', () => {
    expect(judge({ ...GOOD, glErrors: { frames: 0, empty: 0x0506, room: 0 } })).toHaveLength(1)
  })

  it('fails when the card frame has no opaque pixel', () => {
    const cards = { ...GOOD.cards, opaque: 0 }
    const failures = judge({ ...GOOD, cards })
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatch(/covers 0\.0%/)
  })

  it('passes a card frame exactly at the coverage floor and fails one pixel below it', () => {
    const at = { ...GOOD.cards, total: 1000, opaque: MIN_CARD_COVERAGE * 1000 }
    expect(judge({ ...GOOD, cards: at })).toEqual([])
    const below = { ...at, opaque: at.opaque - 1 }
    expect(judge({ ...GOOD, cards: below })[0]).toMatch(/covers 4\.9%.*at least 5\.0%/)
  })

  it('fails a frame that drew only a sliver, which is not nothing', () => {
    const cards = { ...GOOD.cards, total: 1_024_000, opaque: 3_000 }
    expect(judge({ ...GOOD, cards })[0]).toMatch(/covers 0\.3%/)
  })

  it('fails on invalid premultiplied output, with how many pixels', () => {
    const cards = { ...GOOD.cards, invalidPremultiplied: 12 }
    expect(judge({ ...GOOD, cards })[0]).toMatch(/premultipl.*12 of 4/i)
  })

  it('fails when an empty scene leaves any alpha', () => {
    const empty = { ...GOOD.empty, maxAlpha: 3 }
    expect(judge({ ...GOOD, empty })[0]).toMatch(/empty scene.*alpha 3/i)
  })

  it('fails on a GL error after the Edit Room, naming the error', () => {
    const failures = judge({ ...GOOD, glErrors: { ...GOOD.glErrors, room: 0x0502 } })
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatch(/gl\.getError\(\).*0x502.*Edit Room/i)
  })

  it('fails a room that stays black, as one whose shader did not compile does', () => {
    const failures = judge({ ...GOOD, room: { total: 1000, lit: 0 } })
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatch(/Edit Room.*0\.0% of its pixels lit/)
  })

  it('passes a room exactly at the lit floor and fails one pixel below it', () => {
    expect(judge({ ...GOOD, room: { total: 1000, lit: MIN_ROOM_LIT * 1000 } })).toEqual([])
    expect(judge({ ...GOOD, room: { total: 1000, lit: MIN_ROOM_LIT * 1000 - 1 } })).toHaveLength(1)
  })

  it('summarises a pass on one line, with the numbers it saw', () => {
    const line = summary(GOOD)
    expect(line).not.toContain('\n')
    expect(line).toContain('3 of 4')
  })

  it('reports every failure, not only the first', () => {
    const failures = judge({
      glErrors: { frames: 1, empty: 1, room: 1 },
      cards: { ...GOOD.cards, opaque: 0 },
      empty: { ...GOOD.empty, maxAlpha: 9 },
      room: { total: 4, lit: 0 },
    })
    expect(failures).toHaveLength(6)
  })
})
