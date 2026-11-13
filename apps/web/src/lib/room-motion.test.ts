import { describe, expect, it } from 'vitest'

import {
  atlasRect,
  fovFor,
  isPortrait,
  pixelRatioFor,
  stepChair,
  stepLook,
  stillCrop,
  throughGlass,
  wheelPixels,
} from './room-motion'
import { ROOM_TUNING } from './room-tuning'

const { look, chair, wheelLinePx } = ROOM_TUNING
const SECOND = 60

describe('stepLook: the pointer turns the view, with weight', () => {
  const run = (
    pointer: { nx: number; ny: number } | null,
    frames: number,
    from = { x: 0, y: 0 },
  ) => {
    const at = { ...from }
    for (let frame = 0; frame < frames; frame++) stepLook(at, pointer, 1 / 60)
    return at
  }

  it('moves towards the pointer a little at a time, not at once', () => {
    const first = { x: 0, y: 0 }
    stepLook(first, { nx: -1, ny: 1 }, 1 / 60)
    expect(first.x).toBeGreaterThan(0)
    expect(first.x).toBeLessThan(look.yaw * 0.1)
  })

  it('settles on the tuned turn at the screen edge and never past it', () => {
    const settled = run({ nx: -1, ny: 1 }, 20 * SECOND)
    expect(settled.x).toBeCloseTo(look.yaw, 3)
    expect(settled.y).toBeCloseTo(look.pitch, 3)
    for (const nx of [-5, 5])
      expect(Math.abs(run({ nx, ny: 0 }, 20 * SECOND).x)).toBeLessThanOrEqual(look.yaw + 1e-9)
  })

  it('turns back to the middle when the pointer leaves, or there is none', () => {
    const away = run(null, 20 * SECOND, { x: 0.1, y: -0.05 })
    expect(Math.abs(away.x) + Math.abs(away.y)).toBeLessThan(1e-3)
  })

  it('is the same at any frame rate for the same time, and ignores a bad number', () => {
    const slow = { x: 0, y: 0 }
    stepLook(slow, { nx: 1, ny: 0 }, 0.1)
    const fast = { x: 0, y: 0 }
    for (let step = 0; step < 10; step++) stepLook(fast, { nx: 1, ny: 0 }, 0.01)
    expect(fast.x).toBeCloseTo(slow.x, 6)
    const bad = { x: 0.05, y: 0 }
    stepLook(bad, { nx: Number.NaN, ny: 0 }, 1 / 60)
    expect(bad.x).not.toBeNaN()
  })
})

describe('stepChair: the chair swivels as the pointer passes, then settles', () => {
  it('turns with a push and comes back to rest', () => {
    const state = { yaw: 0, speed: 0 }
    stepChair(state, 2, 1 / 60)
    expect(state.yaw).not.toBe(0)
    for (let frame = 0; frame < 20 * SECOND; frame++) stepChair(state, 0, 1 / 60)
    expect(Math.abs(state.yaw)).toBeLessThan(1e-3)
  })

  it('never turns past its limit, whatever the push', () => {
    const state = { yaw: 0, speed: 0 }
    for (let frame = 0; frame < 5 * SECOND; frame++) {
      stepChair(state, 1e3, 1 / 60)
      expect(Math.abs(state.yaw)).toBeLessThanOrEqual(chair.maxYaw)
    }
  })
})

describe('wheelPixels: a wheel notch in CSS px, whatever unit the browser reports', () => {
  it('counts pixels as they are, lines at the tuned height and pages as the viewport', () => {
    expect(wheelPixels(120, 0, 800)).toBe(120)
    expect(wheelPixels(3, 1, 800)).toBe(3 * wheelLinePx)
    expect(wheelPixels(-1, 2, 800)).toBe(-800)
  })

  it('reads a bad number as no movement', () => {
    expect(wheelPixels(Number.NaN, 0, 800)).toBe(0)
  })
})

describe('fovFor and isPortrait: the lens follows the screen', () => {
  it('is wider on a tall screen than a wide one, between the tuned limits', () => {
    const { base, extra } = ROOM_TUNING.fov
    expect(fovFor(0.4)).toBeCloseTo(base + extra)
    expect(fovFor(2)).toBeCloseTo(base)
    expect(fovFor(0.9)).toBeLessThan(fovFor(0.7))
    expect(fovFor(Number.NaN)).not.toBeNaN()
  })

  it('calls an upright phone portrait and a laptop not', () => {
    expect(isPortrait(390 / 844)).toBe(true)
    expect(isPortrait(1440 / 900)).toBe(false)
  })
})

describe('stillCrop: a still is cut to 16:9 at its focal point', () => {
  const ratio = (crop: { width: number; height: number }) => crop.width / crop.height

  it('is always 16:9 and inside the picture', () => {
    for (const [width, height] of [
      [1280, 720],
      [1000, 1000],
      [3000, 900],
      [400, 900],
    ] as const) {
      for (const focalPoint of [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 100 },
      ]) {
        const crop = stillCrop(width, height, focalPoint)
        expect(ratio(crop)).toBeCloseTo(16 / 9, 6)
        expect(crop.x).toBeGreaterThanOrEqual(0)
        expect(crop.y).toBeGreaterThanOrEqual(0)
        expect(crop.x + crop.width).toBeLessThanOrEqual(width + 1e-9)
        expect(crop.y + crop.height).toBeLessThanOrEqual(height + 1e-9)
      }
    }
  })

  it('keeps a 16:9 picture whole, and follows the focal point on a square one', () => {
    expect(stillCrop(1280, 720, { x: 20, y: 90 })).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
    })
    const high = stillCrop(1000, 1000, { x: 50, y: 0 })
    const low = stillCrop(1000, 1000, { x: 50, y: 100 })
    expect(high.y).toBe(0)
    expect(low.y + low.height).toBeCloseTo(1000)
  })
})

describe('atlasRect: each place has its own cell of the atlas', () => {
  it('gives eight cells that fill the atlas without overlap', () => {
    const cells = Array.from({ length: ROOM_TUNING.places }, (_, place) => atlasRect(place))
    expect(cells.reduce((area, [, , width, height]) => area + width * height, 0)).toBeCloseTo(1)
    expect(new Set(cells.map(([u, v]) => `${u},${v}`)).size).toBe(ROOM_TUNING.places)
    for (const [u, v, width, height] of cells) {
      expect(u).toBeGreaterThanOrEqual(0)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(u + width).toBeLessThanOrEqual(1 + 1e-9)
      expect(v + height).toBeLessThanOrEqual(1 + 1e-9)
    }
  })
})

describe('pixelRatioFor: the drawing buffer is sharp but not wasteful', () => {
  const { max, touchMax } = ROOM_TUNING.pixelRatio

  it('follows the screen up to the cap, a lower one on touch', () => {
    expect(pixelRatioFor(1, false)).toBe(1)
    expect(pixelRatioFor(3, false)).toBe(max)
    expect(pixelRatioFor(3, true)).toBe(touchMax)
    expect(pixelRatioFor(1.25, true)).toBe(1.25)
  })

  it('takes 1 for a ratio the browser does not give', () => {
    for (const bad of [0, -2, NaN]) expect(pixelRatioFor(bad, false)).toBe(1)
  })
})

describe('throughGlass: a screen point back through the bend, to the point of the room it shows', () => {
  const { bend } = ROOM_TUNING.glass
  const at = (nx: number, ny: number, aspect = 16 / 9) =>
    throughGlass(nx, ny, aspect, { nx: 0, ny: 0 })

  it('maps the centre to the centre', () => {
    expect(at(0, 0)).toEqual({ nx: 0, ny: 0 })
  })

  it('maps the edges inward, the middle most, and keeps the corners on the corners', () => {
    const edge = at(1, 0)
    expect(edge.nx).toBeGreaterThan(0)
    expect(edge.nx).toBeLessThan(1)
    expect(at(0.01, 0).nx / 0.01).toBeCloseTo(1 / (1 + bend), 1) // the middle is magnified by 1 + bend
    expect(at(1, 1).nx).toBeCloseTo(1)
    expect(at(-1, -1).ny).toBeCloseTo(-1)
  })

  it('is symmetric, and never reads past the room', () => {
    const a = at(0.6, -0.3)
    const b = at(-0.6, 0.3)
    expect(b.nx).toBeCloseTo(-a.nx)
    expect(b.ny).toBeCloseTo(-a.ny)
    for (const nx of [-1, -0.5, 0, 0.5, 1])
      for (const ny of [-1, -0.5, 0, 0.5, 1]) {
        const p = at(nx, ny)
        expect(Math.abs(p.nx)).toBeLessThanOrEqual(1 + 1e-9)
        expect(Math.abs(p.ny)).toBeLessThanOrEqual(1 + 1e-9)
      }
  })

  it('writes into the point it is given and returns it, so a frame allocates nothing', () => {
    const out = { nx: 9, ny: 9 }
    expect(throughGlass(0.5, 0.5, 1.5, out)).toBe(out)
    expect(out.nx).not.toBe(9)
  })

  it('never gives NaN, whatever the pointer or the screen', () => {
    for (const [x, y, aspect] of [
      [NaN, 0.2, 1.5],
      [0.2, Infinity, 1.5],
      [0.2, 0.2, NaN],
      [0.2, 0.2, 0],
    ] as const) {
      const p = at(x, y, aspect)
      expect(Number.isFinite(p.nx) && Number.isFinite(p.ny)).toBe(true)
    }
  })
})
