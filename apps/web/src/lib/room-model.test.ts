import { describe, expect, it } from 'vitest'

import {
  cameraPose,
  createScroll,
  placeWorks,
  scrollBy,
  stepScroll,
  stopForPlace,
} from './room-model'
import { ROOM_TUNING } from './room-tuning'

const range = (length: number) => Array.from({ length }, (_, index) => index)

describe('placeWorks', () => {
  it('puts Work i on place i, in the Editor order', () => {
    expect(placeWorks(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
    ])
  })

  it('leaves the places with no Work dark', () => {
    expect(placeWorks(['a', 'b', 'c'])).toEqual(['a', 'b', 'c', null, null, null, null, null])
    expect(placeWorks([])).toEqual(Array(ROOM_TUNING.places).fill(null))
  })

  it('leaves out the Works past the eighth', () => {
    expect(placeWorks(range(12))).toEqual(range(8))
  })
})

type Pair = [number[], number[]]

// The prototype's stops (docs/design/home2/editroom.js), kept here as literals: a retune of
// ROOM_TUNING fails this until the owner updates it on purpose.
const PROTOTYPE_DESKTOP: Pair[] = [
  [
    [0.1, 1.62, 2.2],
    [0, 1.15, -1.8],
  ],
  [
    [0.05, 1.42, 0.15],
    [0, 1.05, -1.75],
  ],
  [
    [-0.62, 1.2, -0.75],
    [-0.45, 1.04, -1.75],
  ],
  [
    [0.62, 1.2, -0.75],
    [0.45, 1.04, -1.75],
  ],
  [
    [0.05, 1.5, -0.6],
    [0.05, 0.76, -1.4],
  ],
  [
    [-0.2, 1.5, -0.1],
    [1.5, 1.4, -0.55],
  ],
]
const PROTOTYPE_PHONE: Pair[] = [
  [
    [0, 1.7, 2.3],
    [0, 1.15, -1.8],
  ],
  [
    [0, 1.35, 0.1],
    [0, 1.05, -1.75],
  ],
  [
    [0, 1.2, -0.9],
    [0, 1.05, -1.78],
  ],
  [
    [-0.6, 1.2, -0.95],
    [-0.5, 1.04, -1.75],
  ],
  [
    [0.6, 1.2, -0.95],
    [0.5, 1.04, -1.75],
  ],
  [
    [-0.58, 1.25, -1.05],
    [-0.6, 0.76, -1.4],
  ],
  [
    [0.64, 1.2, -1.0],
    [0.66, 0.76, -1.33],
  ],
  [
    [0.4, 1.5, -1.0],
    [1.5, 1.45, -1.0],
  ],
  [
    [0.4, 1.5, -0.1],
    [1.5, 1.45, -0.1],
  ],
]

describe.each([
  ['desktop', false, PROTOTYPE_DESKTOP],
  ['phone', true, PROTOTYPE_PHONE],
])('camera path on %s', (_name, phone, stops) => {
  it('passes through every prototype stop, so both ends are the first and last stop', () => {
    stops.forEach(([position, lookAt], index) => {
      const pose = cameraPose(index / (stops.length - 1), phone)
      pose.position.forEach((v, axis) => expect(v).toBeCloseTo(position[axis]!, 9))
      pose.lookAt.forEach((v, axis) => expect(v).toBeCloseTo(lookAt[axis]!, 9))
    })
  })

  it('has no NaN and no jump along the whole path, sampled densely', () => {
    const steps = 5000
    let previous = cameraPose(0, phone)
    for (let i = 1; i <= steps; i += 1) {
      const pose = cameraPose(i / steps, phone)
      for (const v of [...pose.position, ...pose.lookAt]) expect(Number.isFinite(v)).toBe(true)
      // The path is a few metres long: a step of 1/5000 of it never moves the camera far.
      pose.position.forEach((v, axis) =>
        expect(Math.abs(v - previous.position[axis]!)).toBeLessThan(0.02),
      )
      previous = pose
    }
  })

  it('clamps a position off the path to its ends', () => {
    expect(cameraPose(-3, phone)).toEqual(cameraPose(0, phone))
    expect(cameraPose(4, phone)).toEqual(cameraPose(1, phone))
  })

  it('finds a stop that shows each of the 8 places, and the camera reaches it', () => {
    for (const place of range(8)) {
      const stop = stopForPlace(place, phone)
      expect(stop.index).toBeGreaterThanOrEqual(0)
      expect(stop.index).toBeLessThan(stops.length)
      expect(stop.progress).toBeCloseTo(stop.index / (stops.length - 1), 12)
      const [position] = stops[stop.index]!
      expect(cameraPose(stop.progress, phone).position[0]).toBeCloseTo(position[0]!, 9)
    }
  })
})

describe('stopForPlace', () => {
  it('shows one print at a time on a phone', () => {
    expect(stopForPlace(6, true).index).not.toBe(stopForPlace(7, true).index)
  })

  it('rejects a place that does not exist', () => {
    expect(() => stopForPlace(8, false)).toThrow(RangeError)
    expect(() => stopForPlace(-1, true)).toThrow(RangeError)
    expect(() => stopForPlace(1.5, true)).toThrow(RangeError)
  })
})

describe('virtual scroll', () => {
  it('starts at the doorway', () => {
    expect(createScroll()).toEqual({ target: 0, progress: 0 })
  })

  it('moves the target by the travel over the scroll length, and follows it with weight', () => {
    const moved = scrollBy(createScroll(), ROOM_TUNING.scrollLengthPx / 4)
    expect(moved.target).toBeCloseTo(0.25, 12)
    expect(moved.progress).toBe(0)
    const a = stepScroll(moved, 1 / 60)
    const b = stepScroll(a, 1 / 60)
    expect(a.progress).toBeGreaterThan(0)
    expect(a.progress).toBeLessThan(0.25)
    expect(b.progress).toBeGreaterThan(a.progress)
  })

  it('comes to rest on the target, from either side', () => {
    let state = scrollBy(createScroll(), ROOM_TUNING.scrollLengthPx / 2)
    for (let i = 0; i < 600; i += 1) state = stepScroll(state, 1 / 60)
    expect(state.progress).toBeCloseTo(0.5, 6)
    state = scrollBy(state, -ROOM_TUNING.scrollLengthPx / 4)
    for (let i = 0; i < 600; i += 1) state = stepScroll(state, 1 / 60)
    expect(state.progress).toBeCloseTo(0.25, 6)
  })

  it('stops at both ends however far the wheel goes, and never overshoots', () => {
    let state = scrollBy(createScroll(), ROOM_TUNING.scrollLengthPx * 50)
    expect(state.target).toBe(1)
    for (let i = 0; i < 600; i += 1) {
      state = stepScroll(state, 1 / 60)
      expect(state.progress).toBeLessThanOrEqual(1)
    }
    state = scrollBy(state, -ROOM_TUNING.scrollLengthPx * 50)
    expect(state.target).toBe(0)
    for (let i = 0; i < 600; i += 1) {
      state = stepScroll(state, 1 / 60)
      expect(state.progress).toBeGreaterThanOrEqual(0)
    }
  })

  it('moves the same distance in the same time at any frame rate, and survives a stalled frame', () => {
    const run = (fps: number) => {
      let state = scrollBy(createScroll(), ROOM_TUNING.scrollLengthPx / 2)
      for (let i = 0; i < fps / 2; i += 1) state = stepScroll(state, 1 / fps)
      return state.progress
    }
    expect(run(30)).toBeCloseTo(run(144), 2)
    const stalled = stepScroll(scrollBy(createScroll(), ROOM_TUNING.scrollLengthPx), 60)
    expect(stalled.progress).toBeLessThanOrEqual(1)
    expect(Number.isFinite(stalled.progress)).toBe(true)
  })
})
