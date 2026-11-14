import { describe, expect, it } from 'vitest'

import {
  createDraught,
  createSheet,
  landPage,
  landSheet,
  resetSheet,
  stepDraught,
  stepHinge,
  type Draught,
  type HingeInput,
  type HingeSheet,
} from './pinboard-hinge'

const VIEW = { width: 1440, portrait: false }
const FRAME = 1 / 60
const MAX_DT = 0.033

/** A still pointer far from the board and no wind: only the springs act. */
const calm = (now = 0): HingeInput => ({
  pointer: { x: -1e5, y: -1e5 },
  draught: createDraught({ x: -1e5, y: -1e5 }),
  view: VIEW,
  now,
})

const settle = (sheet: HingeSheet, dt: number, seconds = 20) => {
  const input = calm()
  for (let t = 0; t < seconds; t += dt) stepHinge(sheet, dt, input)
  return sheet
}

describe('stepHinge: a sheet swings on its pin and settles', () => {
  it('settles to its rest tilt and zero lift from any start inside the clamps, at 60 fps and at the dt clamp', () => {
    for (const dt of [FRAME, MAX_DT])
      for (const a of [-42, -10, 0, 25, 42])
        for (const l of [-0.15, 0, 1.5])
          for (const w of [-300, 0, 300]) {
            const sheet = createSheet(2, 700, 400)
            Object.assign(sheet, { a, l, w, lv: w / 50 })
            settle(sheet, dt)
            expect(sheet.a).toBeCloseTo(2, 3)
            expect(sheet.l).toBeCloseTo(0, 3)
          }
  })

  it('settles flat (angle and lift near 0) at full hover', () => {
    const sheet = createSheet(-4, 700, 400)
    Object.assign(sheet, { a: 30, l: 1, w: 100, hv: 1 })
    settle(sheet, FRAME)
    expect(sheet.a).toBeCloseTo(0, 3)
    expect(sheet.l).toBeCloseTo(0, 3)
  })

  it('moves about the same for the same time at any frame rate', () => {
    const fast = createSheet(0, 700, 400)
    const slow = createSheet(0, 700, 400)
    fast.a = slow.a = 20
    const input = calm()
    for (let step = 0; step < 60; step++) stepHinge(fast, 1 / 120, input)
    for (let step = 0; step < 15; step++) stepHinge(slow, 1 / 30, input)
    expect(Math.abs(fast.a - slow.a)).toBeLessThan(2)
  })
})

/** A pointer sweeping across at `speed` px/s, from `x0`, for `seconds`; the board answers every frame. */
const sweep = (
  sheets: HingeSheet[],
  {
    speed,
    x0 = 400,
    y = 400,
    seconds = 0.3,
    dt = FRAME,
    gusting = true,
  }: { speed: number; x0?: number; y?: number; seconds?: number; dt?: number; gusting?: boolean },
  draught: Draught = createDraught({ x: x0, y }),
) => {
  let now = 1000
  const pointer = { x: x0, y }
  for (let step = 0; step < Math.round(seconds / dt); step++) {
    now += dt * 1000
    pointer.x += speed * dt
    stepDraught(draught, pointer, dt, now, VIEW.width, gusting)
    for (const sheet of sheets) stepHinge(sheet, dt, { pointer, draught, view: VIEW, now })
  }
  return { draught, now, pointer }
}

describe('stepHinge: clamps and bad numbers', () => {
  it('never leaves its clamps, nor turns NaN, under wild wind and gusts at the dt clamp for many steps', () => {
    const sheets = [createSheet(-2, 700, 400), createSheet(3, 760, 420)]
    sheets[1]!.hv = 0.5
    const draught = createDraught({ x: 0, y: 400 })
    const pointer = { x: 0, y: 400 }
    for (let step = 0; step < 3000; step++) {
      const now = step * MAX_DT * 1000
      pointer.x = step % 7 < 3 ? 700 + 2000 * Math.sin(step) : 700 - 150 * (step % 5)
      pointer.y = 400 + 300 * Math.cos(step * 1.3)
      stepDraught(draught, pointer, MAX_DT, now, VIEW.width, true)
      for (const sheet of sheets) {
        stepHinge(sheet, MAX_DT, { pointer, draught, view: VIEW, now })
        expect(Math.abs(sheet.a)).toBeLessThanOrEqual(42)
        expect(sheet.l).toBeGreaterThanOrEqual(-0.15)
        expect(sheet.l).toBeLessThanOrEqual(1.5)
        expect(Number.isFinite(sheet.w) && Number.isFinite(sheet.lv)).toBe(true)
      }
    }
  })

  it('treats a huge, zero, negative or bad dt as at most the clamp, and a bad pointer as no NaN', () => {
    for (const dt of [5, Infinity, 0, -1, Number.NaN]) {
      const sheet = createSheet(0, 700, 400)
      sheet.a = 20
      const draught = createDraught({ x: 700, y: 400 })
      stepDraught(draught, { x: Number.NaN, y: Infinity }, dt, 0, VIEW.width, true)
      stepHinge(sheet, dt, { pointer: { x: Number.NaN, y: 0 }, draught, view: VIEW, now: 0 })
      expect(Number.isFinite(draught.vx) && Number.isFinite(draught.vy)).toBe(true)
      expect(Number.isFinite(sheet.a) && Number.isFinite(sheet.l)).toBe(true)
      expect(Math.abs(sheet.a - 20)).toBeLessThan(1) // one short step, not a leap
    }
  })
})

describe('the draught pushes and lifts the sheets near the pointer', () => {
  it('wind to the right swings the bottom left (negative angle) and lifts the sheet', () => {
    const near = createSheet(0, 700, 400)
    sweep([near], { speed: 1200, x0: 520, seconds: 0.25, gusting: false })
    expect(near.a).toBeLessThan(-1)
    expect(near.l).toBeGreaterThan(0.05)
  })

  it('barely moves a sheet far from the pointer', () => {
    const near = createSheet(0, 700, 400)
    const far = createSheet(0, 1400, 880)
    sweep([near, far], { speed: 1200, x0: 520, seconds: 0.25, gusting: false })
    expect(Math.abs(far.a)).toBeLessThan(Math.abs(near.a) / 50)
    expect(Math.abs(far.l)).toBeLessThan(near.l / 50)
  })

  it('smooths the pointer velocity, never past ±4000 px/s, the same at any frame rate', () => {
    const at = (dt: number) =>
      sweep([], { speed: 900, seconds: 0.1, dt, gusting: false }).draught.vx
    expect(at(FRAME)).toBeGreaterThan(450)
    expect(at(FRAME)).toBeLessThan(900)
    expect(at(1 / 120)).toBeCloseTo(at(FRAME), 0)
    expect(sweep([], { speed: 1e6, seconds: 1, gusting: false }).draught.vx).toBeCloseTo(4000, 3)
  })
})

describe('gusts: a fast sweep sends a wave of lifting paper', () => {
  it('starts a wave only past 1500 px/s while gusting, at most every 160 ms and four live', () => {
    expect(sweep([], { speed: 1300 }).draught.gusts).toHaveLength(0)
    expect(sweep([], { speed: 3000, gusting: false }).draught.gusts).toHaveLength(0)
    const { draught } = sweep([], { speed: 3000, seconds: 0.5 })
    expect(draught.gusts.length).toBeGreaterThan(0)
    for (let i = 1; i < draught.gusts.length; i++)
      expect(draught.gusts[i]!.t0 - draught.gusts[i - 1]!.t0).toBeGreaterThan(160)
    expect(sweep([], { speed: 3000, seconds: 1.2, x0: -3000 }).draught.gusts).toHaveLength(4)
  })

  it('hits each sheet once, only after its front reaches it, and expires after 1.4 s', () => {
    const sheet = createSheet(0, 1200, 400)
    const draught = createDraught({ x: 0, y: 0 })
    draught.gusts.push({ x: 300, y: 400, t0: 0, dir: 1, amp: 1, hit: new Set() })
    const input = (now: number): HingeInput => ({
      pointer: { x: -1e5, y: -1e5 },
      draught,
      view: VIEW,
      now,
    })
    // The front reaches 900 px away at 600 ms.
    stepHinge(sheet, FRAME, input(590))
    expect(sheet.w).toBe(0)
    expect(sheet.lv).toBe(0)
    stepHinge(sheet, FRAME, input(610))
    expect(sheet.w).toBeLessThan(-10) // a gust to the right swings the bottom left
    expect(sheet.lv).toBeGreaterThan(0.5)
    const { w, lv } = sheet
    stepHinge(sheet, FRAME, input(630))
    expect(Math.abs(sheet.w - w)).toBeLessThan(5) // only the spring and damping now
    expect(sheet.lv).toBeLessThan(lv)
    stepDraught(draught, { x: 0, y: 0 }, FRAME, 1399, VIEW.width, false)
    expect(draught.gusts).toHaveLength(1)
    stepDraught(draught, { x: 0, y: 0 }, FRAME, 1400, VIEW.width, false)
    expect(draught.gusts).toHaveLength(0)
  })

  it('does not start a wave on a pointer jump across the view (a touch landing elsewhere)', () => {
    const draught = createDraught({ x: 0, y: 400 })
    stepDraught(draught, { x: 1000, y: 400 }, FRAME, 1000, VIEW.width, true)
    expect(draught.gusts).toHaveLength(0)
  })
})

describe('landing: each sheet swings once as it is pinned', () => {
  it('swings each sheet once per open, after its entrance passes 0.85, alternating by place', () => {
    const even = createSheet(0, 300.1, 400)
    const odd = createSheet(0, 300.1, 400)
    expect(landSheet(even, 2, 0.8, true)).toBe(false)
    expect(landSheet(even, 2, 0.9, false)).toBe(false)
    expect(even.w).toBe(0)
    expect(landSheet(even, 2, 0.9, true)).toBe(true)
    expect(landSheet(odd, 1, 0.9, true)).toBe(true)
    expect(even.w).toBeGreaterThanOrEqual(22)
    expect(even.w).toBeLessThanOrEqual(40)
    expect(odd.w).toBe(-even.w)
    expect(landSheet(even, 2, 1, true)).toBe(false)
    expect(even.w).toBe(-odd.w)
    resetSheet(even) // the next open
    expect(landSheet(even, 2, 0.9, true)).toBe(true)
  })

  it('swings the page −48 once, as its scale passes 0.78 while open', () => {
    const page = createSheet(-2.5, 720, 300)
    expect(landPage(page, 0.7, true)).toBe(false)
    expect(landPage(page, 0.9, false)).toBe(false)
    expect(landPage(page, 0.8, true)).toBe(true)
    expect(landPage(page, 1, true)).toBe(false)
    expect(page.w).toBe(-48)
  })

  it('resets to the original tilt, still and unhovered, once closed', () => {
    const sheet = createSheet(3, 700, 400)
    Object.assign(sheet, { a: 20, w: 9, l: 1, lv: 2, rest: 0, hv: 1, landed: true })
    resetSheet(sheet)
    expect(sheet).toEqual(createSheet(3, 700, 400))
  })
})
