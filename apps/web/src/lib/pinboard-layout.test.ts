import { describe, expect, it } from 'vitest'

import { layoutBoard, SHEETS, stringCurve } from './pinboard-layout'

const labels = { prints: [5, 6, 8], legal: 8 }
const SIZES: [number, number][] = [
  [1440, 900],
  [1280, 720],
  [1024, 768],
  [390, 844],
]

describe('layoutBoard', () => {
  it('keeps every sheet inside the view at desktop, laptop, tablet and phone sizes', () => {
    for (const [vw, vh] of SIZES) {
      for (const s of layoutBoard(vw, vh, labels).sheets) {
        expect(s.x - s.w / 2, s.id).toBeGreaterThanOrEqual(0)
        expect(s.x + s.w / 2, s.id).toBeLessThanOrEqual(vw)
        expect(s.y, s.id).toBeGreaterThanOrEqual(0)
        expect(s.y + s.h, s.id).toBeLessThanOrEqual(vh)
      }
    }
  })

  it('flips to portrait exactly past the 1 : 1.15 aspect', () => {
    expect(layoutBoard(1000, 1150, labels).portrait).toBe(false)
    expect(layoutBoard(1000, 1150.5, labels).portrait).toBe(true)
    expect(layoutBoard(390, 844, labels).portrait).toBe(true)
  })

  it('puts nothing above y = 130 on a phone', () => {
    for (const s of layoutBoard(390, 844, labels).sheets) expect(s.y).toBeGreaterThanOrEqual(130)
  })

  it('gives the page sheet the view aspect inside its border', () => {
    for (const [vw, vh] of SIZES) {
      const { b, s1, sheets } = layoutBoard(vw, vh, labels)
      const page = sheets[0]!
      expect((page.w - 2 * b) / (page.h - 2 * b)).toBeCloseTo(vw / vh, 6)
      expect(s1).toBeCloseTo((page.w - 2 * b) / vw, 9)
    }
  })

  it('scales each frame so its picture covers the view in the leave flight', () => {
    for (const [vw, vh] of SIZES) {
      // the page and the strip never fly
      for (const s of layoutBoard(vw, vh, labels).sheets.filter((s) => s.fillW > 0)) {
        expect(s.fillW * s.S).toBeGreaterThanOrEqual(vw)
        expect(s.fillH * s.S).toBeGreaterThanOrEqual(vh)
        // the picture's centre lands on the view's centre
        expect(s.y + s.dy + s.S * s.fillY).toBeCloseTo(vh / 2, 6)
      }
    }
  })

  it('stays finite for tiny and huge views', () => {
    for (const [vw, vh] of [
      [1, 1],
      [0, 0],
      [NaN, 5],
      [1, 5000],
      [5000, 1],
      [20000, 12000],
    ] as const) {
      const board = layoutBoard(vw, vh, labels)
      const numbers = [
        board.K,
        board.PP,
        board.b,
        board.s1,
        board.T1x,
        board.T1y,
        board.Ox,
        board.Oy,
        ...board.sheets.flatMap((s) => [
          s.x,
          s.y,
          s.w,
          s.h,
          s.S,
          s.dx,
          s.dy,
          s.tapeFont,
          s.noteFont,
        ]),
      ]
      expect(numbers.every(Number.isFinite)).toBe(true)
    }
    expect(
      layoutBoard(1, 1, { prints: [], legal: 0 }).sheets.every((s) => Number.isFinite(s.tapeFont)),
    ).toBe(true)
  })

  it('matches the prototype at 1440 × 900', () => {
    const board = layoutBoard(1440, 900, labels)
    expect(board.b).toBe(12)
    expect(board.PP).toBe(1100)
    const [page, l0] = board.sheets
    expect(page).toMatchObject({ x: 720, y: 94.5, w: 432 })
    expect(page!.h).toBeCloseTo(((432 - 24) * 900) / 1440 + 24, 9)
    expect(board.s1).toBeCloseTo(408 / 1440, 9)
    expect(l0).toMatchObject({ x: 216, w: 360 })
    expect(l0!.y).toBeCloseTo(252, 9)
    expect(l0!.h).toBeCloseTo((336 * 9) / 16 + 24, 9)
    expect(l0!.tapeH).toBeCloseTo(93.6, 9)
  })

  it('has no fake note words', () => {
    expect(JSON.stringify(SHEETS)).not.toMatch(/txt|cuma|müzik/)
  })
})

describe('stringCurve', () => {
  const calm = { bows: false, angle: 0, pageAngle: 0, lift: 0, taut: 0 }
  const from = { x: 100, y: 0 }
  const to = { x: 100, y: 100 }

  it('runs from pin to pin', () => {
    expect(stringCurve(from, to, calm)).toMatch(/^M100 9Q.* 100 109$/)
  })

  it('sags less when taut and more when lifted', () => {
    const my = (opts: Partial<typeof calm>) =>
      Number(stringCurve(from, to, { ...calm, ...opts }).match(/Q\S+ (\S+) /)![1])
    expect(my({ taut: 1 })).toBeLessThan(my({}))
    expect(my({ lift: 1 })).toBeGreaterThan(my({}))
  })

  it('bows the bottom print sideways and swings with the angles', () => {
    const mx = (opts: Partial<typeof calm>) =>
      Number(stringCurve(from, to, { ...calm, ...opts }).match(/Q(\S+) /)![1])
    expect(mx({ bows: true })).toBeLessThan(mx({}))
    expect(mx({ angle: 3 })).toBeGreaterThan(mx({}))
  })
})
