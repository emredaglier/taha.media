import { describe, expect, it } from 'vitest'

import { createScroll, HOLD_PROGRESS, scrollBy, stepScroll, type RoomScroll } from './room-model'
import {
  createOpening,
  createOpeningState,
  HOLD_SECONDS,
  isOpening,
  OPENING_SECONDS,
  openingAt,
  openingSeconds,
  skipOpening,
  stepOpening,
  type OpeningClock,
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

/**
 * Asserts the picture stays within the flash limit over `states`, one per frame at 60 fps: steps
 * under 10% a frame and at most 3 flashes a second. A worst case over the opening's real values.
 * The picture's brightness is the screens (woken by `screens`, at their rest `base`) weighted by
 * how much of the view each fills: the middle monitor fills the view while the camera is on it
 * (`fly` 1) and shrinks as it pulls back (at most as fast as `fly` squared falls), the others
 * share what it leaves. What the middle monitor shows is the Showreel (`reel`) or its Work, taken
 * at the extremes (one white, the other black), both ways round.
 */
function expectWithinFlashLimit(states: OpeningState[]) {
  const { place: middle } = ROOM_TUNING.opening
  const others = ROOM_TUNING.places - 1
  const luminance = (state: OpeningState, reelIsWhite: boolean) => {
    const mid = state.fly ** 2
    const content = reelIsWhite ? state.reel : 1 - state.reel
    let total = mid * state.screens[middle]! * ROOM_TUNING.screens[middle]!.base * content
    for (let place = 0; place < ROOM_TUNING.places; place++) {
      if (place !== middle)
        total += ((1 - mid) / others) * state.screens[place]! * ROOM_TUNING.screens[place]!.base
    }
    return total
  }
  for (const reelIsWhite of [true, false]) {
    const series = states.map((state) => luminance(state, reelIsWhite))
    // The largest step from one frame to the next.
    const steps = series.slice(1).map((value, i) => Math.abs(value - series[i]!))
    expect(Math.max(...steps)).toBeLessThan(0.1)
    // Flashes: a swing of 10% or more that is followed at once by a swing back, counted per second.
    const swings: { at: number; delta: number }[] = []
    let start = 0
    for (let i = 1; i < series.length; i++) {
      const turning =
        i === series.length - 1 ||
        Math.sign(series[i + 1]! - series[i]!) * Math.sign(series[i]! - series[i - 1]!) < 0
      if (turning && Math.abs(series[i]! - series[start]!) >= 0.1) {
        swings.push({ at: i / FPS, delta: series[i]! - series[start]! })
        start = i
      }
    }
    const flashes = swings
      .slice(1)
      .filter((swing, i) => Math.sign(swing.delta) !== Math.sign(swings[i]!.delta))
    for (const flash of flashes) {
      expect(
        flashes.filter((other) => Math.abs(other.at - flash.at) < 1).length,
      ).toBeLessThanOrEqual(3)
    }
  }
}

/** A room that plays its opening: the clock at the start, the scroll at the hold. */
const opens = () => ({
  clock: createOpening(false),
  scroll: { target: HOLD_PROGRESS, progress: HOLD_PROGRESS },
})
/** A room that starts at rest, at the path's first stop. */
const atRest = () => ({ clock: createOpening(true), scroll: createScroll() })
/** Runs `count` frames at 60 fps, as the room does, and returns the opening each one shows. */
const play = (room: { clock: OpeningClock; scroll: RoomScroll }, count: number) =>
  Array.from({ length: count }, () => {
    stepScroll(room.scroll, 1 / FPS)
    stepOpening(room.clock, 1 / FPS)
    return sample(openingSeconds(room.clock, room.scroll.progress))
  })
/** The wheel travel that scrubs from the hold to rest. */
const SCRUB_PX = ROOM_TUNING.opening.scrollPx

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

  it('keeps the picture within the flash limit: steps under 10% a frame and at most 3 flashes a second', () => {
    expectWithinFlashLimit(frames.map(sample))
  })

  it('keeps a scrub at any speed within the flash limit, both ways and turning back', () => {
    for (const px of [40, 400, SCRUB_PX, SCRUB_PX * 3, 1e7]) {
      const room = opens()
      const states = play(room, FPS) // the intro, to the hold
      scrollBy(room.scroll, px)
      states.push(...play(room, 8 * FPS))
      scrollBy(room.scroll, -px)
      states.push(...play(room, 8 * FPS))
      expectWithinFlashLimit(states)
    }
    // A flick in, and a flick back out before the room has come up.
    const room = opens()
    const states = play(room, FPS)
    scrollBy(room.scroll, 1e7)
    states.push(...play(room, FPS / 2))
    scrollBy(room.scroll, -1e7)
    states.push(...play(room, 8 * FPS))
    expectWithinFlashLimit(states)
  })
})

describe('the opening and the scroll (#140)', () => {
  it('holds on the Showreel when nobody scrolls: time plays it to the hold and no further', () => {
    const room = opens()
    const hold = play(room, 10 * FPS).at(-1)!
    expect(hold).toEqual(sample(HOLD_SECONDS))
    expect(hold).toMatchObject({ reel: 1, fly: 1, settled: false })
    expect(hold.screens[ROOM_TUNING.opening.place]).toBe(1) // the middle monitor is fully awake
    expect(isOpening(room.clock, room.scroll)).toBe(true)
  })

  it('scrolling forward from the hold reaches the same rest state as before, at the first stop', () => {
    const room = opens()
    play(room, FPS)
    scrollBy(room.scroll, SCRUB_PX)
    expect(play(room, 10 * FPS).at(-1)).toEqual(createOpeningState())
    expect(isOpening(room.clock, room.scroll)).toBe(false)
    expect(room.scroll.progress).toBeCloseTo(0, 3)
  })

  it('a scroll past the end of the opening goes on along the path, at rest', () => {
    const room = opens()
    play(room, FPS)
    scrollBy(room.scroll, SCRUB_PX + ROOM_TUNING.scrollLengthPx / 2)
    expect(play(room, 10 * FPS).at(-1)).toEqual(createOpeningState())
    expect(room.scroll.progress).toBeCloseTo(0.5, 3)
  })

  it('scrolling back from the first stop returns to the hold, and forward again to rest', () => {
    const room = atRest()
    expect(isOpening(room.clock, room.scroll)).toBe(false)
    scrollBy(room.scroll, -1e7)
    expect(play(room, 10 * FPS).at(-1)).toEqual(sample(HOLD_SECONDS))
    expect(isOpening(room.clock, room.scroll)).toBe(true)
    scrollBy(room.scroll, 1e7)
    expect(play(room, 10 * FPS).at(-1)).toEqual(createOpeningState())
  })

  it('does not scrub while the intro plays: the clock alone moves it to the hold', () => {
    const room = opens()
    play(room, 10)
    expect(openingSeconds(room.clock, room.scroll.progress)).toBeCloseTo(10 / FPS, 10)
  })
})

describe('the opening clock', () => {
  it('takes a click or tap at any point of the opening to rest, and a Work is choosable right after', () => {
    const intro = opens()
    play(intro, 10)
    const hold = opens()
    play(hold, 2 * FPS)
    const scrub = opens()
    play(scrub, FPS)
    scrollBy(scrub.scroll, SCRUB_PX / 2)
    play(scrub, 10)
    const back = atRest()
    scrollBy(back.scroll, -SCRUB_PX / 2)
    play(back, 30)
    for (const room of [intro, hold, scrub, back]) {
      expect(isOpening(room.clock, room.scroll)).toBe(true) // no Work is choosable yet: a click skips
      skipOpening(room.clock, room.scroll)
      expect(isOpening(room.clock, room.scroll)).toBe(false) // choosable right after
      expect(play(room, 1)[0]).toEqual(createOpeningState())
    }
  })

  it('a skip only brightens: it is one step towards the finished room', () => {
    const rest = createOpeningState()
    for (const seconds of frames) {
      const mid = sample(seconds)
      for (const place of Array(ROOM_TUNING.places).keys()) {
        expect(rest.screens[place]!).toBeGreaterThanOrEqual(mid.screens[place]!)
      }
      expect(rest.room).toBeGreaterThanOrEqual(mid.room)
      expect(rest.lamp).toBeGreaterThanOrEqual(mid.lamp)
    }
  })

  it('a visitor coming back to the room starts at rest, with nothing to skip', () => {
    const room = atRest()
    expect(isOpening(room.clock, room.scroll)).toBe(false)
    expect(
      openingAt(openingSeconds(room.clock, room.scroll.progress), createOpeningState()),
    ).toEqual(createOpeningState())
  })

  it('takes a bad frame time as no time at all', () => {
    const clock = createOpening(false)
    for (const dt of [Number.NaN, -1, 0]) stepOpening(clock, dt)
    expect(clock.seconds).toBe(0)
  })
})
