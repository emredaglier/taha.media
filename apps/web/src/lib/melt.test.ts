import { describe, expect, it } from 'vitest'

import { MELT, settled, springStep, visibleRect, type Spring } from './melt'

const run = (from: Spring, to: number, seconds: number, dt = 1 / 60) => {
  const path = [from]
  for (let t = 0; t < seconds; t += dt) path.push(springStep(path.at(-1)!, to, dt))
  return path
}

describe('springStep', () => {
  it('stays put at its target', () => {
    expect(springStep({ power: 70, speed: 0 }, 70, 1 / 60)).toEqual({ power: 70, speed: 0 })
  })

  it('moves toward the target and wobbles past it, as a loose spring does', () => {
    const path = run({ power: 0, speed: 0 }, MELT.rest, 3)
    expect(path[1]!.power).toBeGreaterThan(0)
    expect(Math.max(...path.map((s) => s.power))).toBeGreaterThan(MELT.rest)
  })

  it('settles on the target, from below, above, and after a click kick', () => {
    const starts = [
      { power: 0, speed: 0 },
      { power: 300, speed: 0 },
      { power: 70, speed: MELT.kick },
    ]
    for (const start of starts) {
      expect(settled(run(start, MELT.rest, 6).at(-1)!, MELT.rest)).toBe(true)
    }
  })

  it('takes about the same path with half-size steps', () => {
    const one = run({ power: 0, speed: 0 }, 70, 0.5, 1 / 60).at(-1)!
    const half = run({ power: 0, speed: 0 }, 70, 0.5, 1 / 120).at(-1)!
    expect(half.power).toBeCloseTo(one.power, -1)
  })
})

describe('visibleRect', () => {
  const natural = { width: 1600, height: 900 }
  const boxes = [
    { width: 300, height: 300 },
    { width: 900, height: 200 },
    { width: 160, height: 900 },
    { width: 1600, height: 900 },
  ]
  const spots = [0, 0.3, 0.5, 1].flatMap((x) => [0, 0.7, 1].map((y) => ({ x, y })))

  it('keeps the box shape and stays inside the picture, for any box and position', () => {
    for (const box of boxes) {
      for (const position of spots) {
        const r = visibleRect(box, natural, 'cover', position)!
        expect(r.x).toBeGreaterThanOrEqual(-1e-9)
        expect(r.y).toBeGreaterThanOrEqual(-1e-9)
        expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9)
        expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9)
        expect(Math.max(r.w, r.h)).toBeCloseTo(1)
        expect((r.w * natural.width) / (r.h * natural.height)).toBeCloseTo(box.width / box.height)
      }
    }
  })

  it('puts the cropped side at the start, middle or end by the position', () => {
    const square = { width: 300, height: 300 }
    const at = (x: number) => visibleRect(square, natural, 'cover', { x, y: 0.5 })!
    expect(at(0).x).toBe(0)
    expect(at(1).x + at(1).w).toBeCloseTo(1)
    expect(at(0.5).x).toBeCloseTo((1 - at(0.5).w) / 2)
  })

  it('shows all of a picture when the box has its shape', () => {
    const r = visibleRect({ width: 800, height: 450 }, natural, 'cover', { x: 0.2, y: 0.9 })!
    expect(r.x).toBeCloseTo(0)
    expect(r.y).toBeCloseTo(0)
    expect(r.w).toBeCloseTo(1)
    expect(r.h).toBeCloseTo(1)
  })

  it('stretches a fill to the whole picture, and skips fits with empty bands', () => {
    expect(visibleRect(boxes[0]!, natural, 'fill', { x: 0, y: 0 })).toEqual({
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    })
    expect(visibleRect(boxes[0]!, natural, 'contain', { x: 0.5, y: 0.5 })).toBeNull()
  })
})
