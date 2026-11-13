import { describe, expect, it } from 'vitest'

import {
  createOpening,
  createOpeningState,
  isOpening,
  OPENING_SECONDS,
  openingAt,
  skipOpening,
  stepOpening,
  type OpeningState,
} from './room-opening'
import { ROOM_TUNING } from './room-tuning'

const FPS = 60
const frames = Array.from({ length: Math.ceil(OPENING_SECONDS * FPS) + 30 }, (_, i) => i / FPS)
const sample = (seconds: number) => structuredClone(openingAt(seconds, createOpeningState()))

/** Every number the opening shows, as one list (the screens, then the rest). */
const channels = (state: OpeningState) => [
  ...state.screens,
  state.room,
  state.lamp,
  state.reel,
  state.fly,
]

describe('the opening', () => {
  it('starts dark, at the middle monitor, with the Showreel on it', () => {
    const start = sample(0)
    expect(start.screens.every((screen) => screen === 0)).toBe(true)
    expect(start).toMatchObject({ room: 0, lamp: 0, reel: 1, fly: 1, settled: false })
  })

  it('wakes the middle monitor first, then the rest in the prototype order', () => {
    const wakes = ROOM_TUNING.opening.screens
      .map(({ place }) => ({
        place,
        at: frames.find((seconds) => sample(seconds).screens[place]! > 0.01)!,
      }))
      .sort((a, b) => a.at - b.at)
      .map(({ place }) => place)
    expect(wakes[0]).toBe(ROOM_TUNING.opening.place)
    expect(wakes).toEqual([1, 0, 2, 4, 5, 3, 6, 7])
  })

  it('reaches rest, and rest is the room with everything on and the camera on its path', () => {
    const end = sample(OPENING_SECONDS)
    expect(end).toEqual(createOpeningState())
    expect(end.settled).toBe(true)
    expect(channels(end)).toEqual([...Array(ROOM_TUNING.places).fill(1), 1, 1, 0, 0])
    expect(sample(OPENING_SECONDS + 100)).toEqual(end)
  })

  it('lasts a few seconds, not longer', () => {
    expect(OPENING_SECONDS).toBeGreaterThan(2)
    expect(OPENING_SECONDS).toBeLessThan(4)
  })

  it('stays inside 0 to 1 and never gives NaN, whatever the time', () => {
    for (const seconds of [...frames, -1, Number.NaN, 1e9]) {
      for (const value of channels(sample(seconds))) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('the opening and WCAG 2.3.1 (flashes)', () => {
  it('only ever brightens: a flash needs a rise and a fall, so none can happen', () => {
    let before = sample(0)
    for (const seconds of frames) {
      const now = sample(seconds)
      // The screens, the room and the lamp rise; the Showreel's share and the pull-back fall.
      for (const place of Array(ROOM_TUNING.places).keys()) {
        expect(now.screens[place]!).toBeGreaterThanOrEqual(before.screens[place]!)
      }
      expect(now.room).toBeGreaterThanOrEqual(before.room)
      expect(now.lamp).toBeGreaterThanOrEqual(before.lamp)
      expect(now.reel).toBeLessThanOrEqual(before.reel)
      expect(now.fly).toBeLessThanOrEqual(before.fly)
      before = now
    }
  })

  it('has no opposing changes at all, so never more than the 3 flashes a second WCAG allows', () => {
    // A flash is a rise and a fall of the picture's brightness (10% or more) close together.
    const luminance = (state: OpeningState) =>
      (state.screens.reduce(
        (sum, screen, place) => sum + screen * ROOM_TUNING.screens[place]!.base,
        0,
      ) /
        ROOM_TUNING.places) *
      (0.3 + 0.7 * state.room)
    let direction = 0
    let reversals = 0
    let before = luminance(sample(0))
    for (const seconds of frames) {
      const now = luminance(sample(seconds))
      const step = Math.sign(now - before)
      if (step !== 0 && direction !== 0 && step !== direction) reversals++
      if (step !== 0) direction = step
      before = now
    }
    expect(reversals).toBe(0)
  })

  it('a skip only brightens too: it is one step towards the finished room', () => {
    for (const seconds of frames) {
      const mid = sample(seconds)
      const clock = { seconds }
      skipOpening(clock)
      const rest = sample(clock.seconds)
      for (const place of Array(ROOM_TUNING.places).keys()) {
        expect(rest.screens[place]!).toBeGreaterThanOrEqual(mid.screens[place]!)
      }
      expect(rest.room).toBeGreaterThanOrEqual(mid.room)
      expect(rest.lamp).toBeGreaterThanOrEqual(mid.lamp)
    }
  })
})

describe('the opening clock', () => {
  it('runs a frame at a time until the opening is over, then holds', () => {
    const clock = createOpening(false)
    expect(isOpening(clock)).toBe(true)
    for (let frame = 0; frame < OPENING_SECONDS * FPS + 5; frame++) stepOpening(clock, 1 / FPS)
    expect(isOpening(clock)).toBe(false)
    expect(clock.seconds).toBe(OPENING_SECONDS)
  })

  it('a skip lands on the same rest state as running to the end, and a Work is choosable at once', () => {
    const run = createOpening(false)
    for (let frame = 0; frame < OPENING_SECONDS * FPS + 5; frame++) stepOpening(run, 1 / FPS)
    const skipped = createOpening(false)
    stepOpening(skipped, 0.4)
    expect(isOpening(skipped)).toBe(true) // no Work is choosable yet: a click skips
    skipOpening(skipped)
    expect(isOpening(skipped)).toBe(false) // choosable right after
    expect(openingAt(skipped.seconds, createOpeningState())).toEqual(
      openingAt(run.seconds, createOpeningState()),
    )
  })

  it('a visitor coming back to the room starts at rest, with nothing to skip', () => {
    const clock = createOpening(true)
    expect(isOpening(clock)).toBe(false)
    expect(openingAt(clock.seconds, createOpeningState())).toEqual(createOpeningState())
  })

  it('takes a bad frame time as no time at all', () => {
    const clock = createOpening(false)
    for (const dt of [Number.NaN, -1, 0]) stepOpening(clock, dt)
    expect(clock.seconds).toBe(0)
  })
})
