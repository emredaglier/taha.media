import { describe, expect, it } from 'vitest'

import {
  cameraPose,
  createScroll,
  HOLD_PROGRESS,
  livePlaces,
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

// Poses between the stops, computed with Three.js 0.187 as the prototype builds its path:
// `CatmullRomCurve3(points, false, 'centripetal')` read at `f`, where
// `f = p - 0.55 sin(p (N - 1) 2 pi) / ((N - 1) 2 pi)` (the linger). A wrong tangent, a wrong
// linger or a wrong end handling moves these.
const BETWEEN: [string, boolean, number, number[], number[]][] = [
  [
    'desktop',
    false,
    0.1,
    [0.1358468124, 1.5268285587, 1.1146931226],
    [0.0093246707, 1.0960495131, -1.7729211491],
  ],
  [
    'desktop',
    false,
    0.33,
    [-0.5499884461, 1.2474906808, -0.5777297035],
    [-0.3727800693, 1.0350425646, -1.7462383376],
  ],
  [
    'desktop',
    false,
    0.5,
    [0.022398005, 1.1557148955, -0.8246043691],
    [-0.0168922306, 1.0625415152, -1.7794710854],
  ],
  [
    'desktop',
    false,
    0.95,
    [-0.1622856522, 1.5029205762, -0.1850665966],
    [1.2344159684, 1.2802690961, -0.6915192105],
  ],
  ['phone', true, 0.1, [0, 1.3839315535, 0.3178994102], [0, 1.0556749414, -1.7493626146]],
  [
    'phone',
    true,
    0.8,
    [0.5979482416, 1.2965144273, -1.0169002917],
    [1.0135553472, 0.9796983921, -1.2624835832],
  ],
  [
    'phone',
    true,
    0.95,
    [0.3824166295, 1.5219792132, -0.4567740776],
    [1.5278648198, 1.4728889592, -0.4362889406],
  ],
]

describe('camera path between the stops', () => {
  it.each(BETWEEN)(
    'matches the prototype curve on %s at %s',
    (_name, phone, progress, position, lookAt) => {
      const pose = cameraPose(progress, phone)
      pose.position.forEach((v, axis) => expect(v).toBeCloseTo(position[axis]!, 6))
      pose.lookAt.forEach((v, axis) => expect(v).toBeCloseTo(lookAt[axis]!, 6))
    },
  )

  it.each([false, true])(
    'lingers at a stop: moves slower there than half way between stops (phone: %s)',
    (phone) => {
      const stops = phone ? 9 : 6
      const travel = (from: number) => {
        const a = cameraPose(from, phone).position
        const b = cameraPose(from + 0.01, phone).position
        return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      }
      // Two stops apart on the path, the second of them a stop and the first half way between stops.
      const atStop = travel(2 / (stops - 1))
      const between = travel(2.5 / (stops - 1))
      expect(atStop).toBeLessThan(between)
    },
  )
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
    expect(createScroll()).toMatchObject({ target: 0, progress: 0 })
  })

  it('moves the target by the travel over the scroll length, and follows it with weight', () => {
    const state = createScroll()
    scrollBy(state, ROOM_TUNING.scrollLengthPx / 4)
    expect(state.target).toBeCloseTo(0.25, 12)
    expect(state.progress).toBe(0)
    stepScroll(state, 1 / 60)
    const first = state.progress
    stepScroll(state, 1 / 60)
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(0.25)
    expect(state.progress).toBeGreaterThan(first)
  })

  it('comes to rest on the target, from either side', () => {
    const state = createScroll()
    scrollBy(state, ROOM_TUNING.scrollLengthPx / 2)
    for (let i = 0; i < 600; i += 1) stepScroll(state, 1 / 60)
    expect(state.progress).toBeCloseTo(0.5, 6)
    scrollBy(state, -ROOM_TUNING.scrollLengthPx / 4)
    for (let i = 0; i < 600; i += 1) stepScroll(state, 1 / 60)
    expect(state.progress).toBeCloseTo(0.25, 6)
  })

  it("stops at the last stop and at the opening's hold however far the wheel goes, and never overshoots", () => {
    const state = createScroll()
    scrollBy(state, ROOM_TUNING.scrollLengthPx * 50)
    expect(state.target).toBe(1)
    for (let i = 0; i < 600; i += 1) {
      stepScroll(state, 1 / 60)
      expect(state.progress).toBeLessThanOrEqual(1)
    }
    scrollBy(state, -ROOM_TUNING.scrollLengthPx * 50)
    expect(state.target).toBe(HOLD_PROGRESS)
    for (let i = 0; i < 1200; i += 1) {
      stepScroll(state, 1 / 60)
      expect(state.progress).toBeGreaterThanOrEqual(HOLD_PROGRESS)
    }
    expect(state.progress).toBeCloseTo(HOLD_PROGRESS, 6)
  })

  it('moves the same distance in the same time at any frame rate, and survives a stalled frame', () => {
    const run = (fps: number) => {
      const state = createScroll()
      scrollBy(state, ROOM_TUNING.scrollLengthPx / 2)
      for (let i = 0; i < fps / 2; i += 1) stepScroll(state, 1 / fps)
      return state.progress
    }
    expect(run(30)).toBeCloseTo(run(144), 2)
    const stalled = createScroll()
    scrollBy(stalled, ROOM_TUNING.scrollLengthPx)
    stepScroll(stalled, 60)
    expect(stalled.progress).toBeLessThanOrEqual(1)
    expect(Number.isFinite(stalled.progress)).toBe(true)
  })

  it('scrolls back past the doorway into the opening by its own scroll length (#140)', () => {
    expect(HOLD_PROGRESS).toBeCloseTo(
      -ROOM_TUNING.opening.scrollPx / ROOM_TUNING.scrollLengthPx,
      12,
    )
    const state = createScroll()
    scrollBy(state, -ROOM_TUNING.opening.scrollPx / 2)
    expect(state.target).toBeCloseTo(HOLD_PROGRESS / 2, 12)
  })

  it('in the opening, turns back at once after a still start, then at most once per turnSeconds (#140)', () => {
    const state = { ...createScroll(), target: HOLD_PROGRESS, progress: HOLD_PROGRESS }
    scrollBy(state, ROOM_TUNING.opening.scrollPx / 2)
    for (let i = 0; i < 20; i += 1) stepScroll(state, 1 / 60)
    scrollBy(state, -ROOM_TUNING.opening.scrollPx) // a change of mind: back out
    let before = state.progress
    stepScroll(state, 1 / 60)
    expect(state.progress).toBeLessThan(before)
    for (let i = 0; i < 20; i += 1) stepScroll(state, 1 / 60)
    scrollBy(state, ROOM_TUNING.opening.scrollPx) // and in again, too soon: it waits
    before = state.progress
    for (let i = 0; i < 30; i += 1) stepScroll(state, 1 / 60)
    expect(state.progress).toBe(before)
    for (let i = 0; i < ROOM_TUNING.opening.turnSeconds * 60; i += 1) stepScroll(state, 1 / 60)
    expect(state.progress).toBeGreaterThan(before)
  })

  it('ignores a NaN input and does not stick at NaN', () => {
    const state = createScroll()
    scrollBy(state, ROOM_TUNING.scrollLengthPx / 4)
    const before = { ...state }
    scrollBy(state, NaN)
    stepScroll(state, NaN)
    expect(state).toEqual(before)
    expect(cameraPose(NaN, false)).toEqual(cameraPose(0, false))
  })
})

describe('cameraPose into a reused pose', () => {
  it('writes into the pose it is given and returns it, with the same numbers as a new one', () => {
    const reused = cameraPose(0, false)
    for (const progress of [0.1, 0.5, 0.95, 1]) {
      expect(cameraPose(progress, false, reused)).toBe(reused)
      expect(reused).toEqual(cameraPose(progress, false))
    }
  })
})

describe('livePlaces', () => {
  const camera = { x: 0, y: 0, z: 0 }
  // Place i stands at distance `far[i]` along x: place 5 is the nearest, then 2, 7, 0, ...
  const far = [4, 7, 2, 8, 6, 1, 5, 3]
  const centres = far.map((x) => ({ x, y: 0, z: 0 }))
  const all = range(ROOM_TUNING.places).map(() => true)
  const playing = (live: readonly boolean[]) => range(live.length).filter((place) => live[place])

  it('plays the tuned number of screens, the nearest ones', () => {
    expect(ROOM_TUNING.liveLoops.desktop).toBe(4)
    expect(playing(livePlaces(camera, centres, all, false))).toEqual([0, 2, 5, 7])
  })

  it('plays at most three on a phone', () => {
    expect(ROOM_TUNING.liveLoops.touch).toBe(3)
    expect(playing(livePlaces(camera, centres, all, true))).toEqual([2, 5, 7])
  })

  it('never plays a dark place, and the next nearest takes its turn', () => {
    const works = all.map((_, place) => place !== 5)
    expect(playing(livePlaces(camera, centres, works, true))).toEqual([0, 2, 7])
  })

  it('plays every Work when there are fewer than the tuned number', () => {
    const works = all.map((_, place) => place < 2)
    expect(playing(livePlaces(camera, centres, works, false))).toEqual([0, 1])
  })

  it('follows the camera', () => {
    expect(playing(livePlaces({ x: 8, y: 0, z: 0 }, centres, all, true))).toEqual([1, 3, 4])
  })

  it('writes into a reused list', () => {
    const out: boolean[] = []
    expect(livePlaces(camera, centres, all, true, out)).toBe(out)
    livePlaces({ x: 8, y: 0, z: 0 }, centres, all, true, out)
    expect(playing(out)).toEqual([1, 3, 4])
  })
})
