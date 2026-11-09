import { describe, expect, it } from 'vitest'

import {
  INDEX_KNUCKLE,
  INDEX_TIP,
  initialGestureState,
  readGesture,
  THUMB_TIP,
  WRIST,
  type GestureEvent,
  type GestureState,
  type HandFrame,
  type ScreenPoint,
} from './hand-gesture'
import { HAND_TUNING } from './hand-tuning'

const FRAME_MS = 1000 / 30
const { frame: crop, lostAfterFrames } = HAND_TUNING

/** A hand whose index fingertip is at (x, y) in the camera's own (unmirrored) picture, 0 to 1. */
const hand = (x: number, y: number): HandFrame =>
  Array.from({ length: 21 }, (_, i) => (i === INDEX_TIP ? { x, y } : { x: 0.5, y: 0.9 }))

/** The camera's clock (ms): only ever moves forward, across every stream fed. */
let clock = 0

/** Feeds `frames` one camera frame apart and returns every event and the last state. */
const feed = (frames: readonly (HandFrame | null)[], from: GestureState = initialGestureState) => {
  let state = from
  const events: GestureEvent[][] = []
  frames.forEach((frame) => {
    clock += FRAME_MS
    const step = readGesture(state, frame, clock)
    state = step.state
    events.push(step.events)
  })
  return { state, events }
}

/** Where the cursor ended (0 to 1 of the screen) after a stream that ends with a hand. */
const cursorAfter = (frames: readonly (HandFrame | null)[]) => feed(frames).state.cursor!

/** A repeatable stand-in for camera noise: a small LCG, -1 to 1. */
const noise = (seed: number) => {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32
    return (s / 2 ** 32) * 2 - 1
  }
}

describe('the cursor', () => {
  it('is mirrored: a fingertip further left in the camera picture is further right on screen', () => {
    const left = cursorAfter(Array(10).fill(hand(0.4, 0.5)))
    const right = cursorAfter(Array(10).fill(hand(0.6, 0.5)))
    expect(left.x).toBeGreaterThan(right.x)
    // Up and down are not mirrored.
    const high = cursorAfter(Array(10).fill(hand(0.5, 0.4)))
    const low = cursorAfter(Array(10).fill(hand(0.5, 0.6)))
    expect(high.y).toBeLessThan(low.y)
  })

  it('maps the middle of the camera frame onto the whole screen, clamped beyond it', () => {
    // In the mirrored picture the crop's left edge is the camera's x = 1 - left.
    const leftEdge = 1 - crop.left
    const rightEdge = 1 - (crop.left + crop.width)
    const at = (x: number, y: number) => cursorAfter(Array(10).fill(hand(x, y)))
    const expectAt = (x: number, y: number, screen: ScreenPoint) => {
      expect(at(x, y).x).toBeCloseTo(screen.x, 9)
      expect(at(x, y).y).toBeCloseTo(screen.y, 9)
    }
    expectAt(leftEdge, crop.top, { x: 0, y: 0 })
    expectAt(rightEdge, crop.top + crop.height, { x: 1, y: 1 })
    expectAt(1, 0, { x: 0, y: 0 })
    expectAt(0, 1, { x: 1, y: 1 })
  })

  it('reports each new cursor as a move', () => {
    const { events } = feed([hand(0.5, 0.5)])
    expect(events[0]).toEqual([{ kind: 'move', point: expect.any(Object) }])
  })

  it('stays within a small radius while a still hand jitters', () => {
    const next = noise(11)
    const jitter = 0.01 // camera-frame units, about the landmark noise of a still hand
    const frames = Array.from({ length: 90 }, () =>
      hand(0.5 + jitter * next(), 0.5 + jitter * next()),
    )
    const still = cursorAfter([hand(0.5, 0.5)])
    let state = initialGestureState
    let worst = 0
    frames.forEach((frame, i) => {
      state = readGesture(state, frame, i * FRAME_MS).state
      // The first reading passes through as it is; judge it once it has steadied (half a second).
      if (i < 15) return
      worst = Math.max(worst, Math.hypot(state.cursor!.x - still.x, state.cursor!.y - still.y))
    })
    // The raw jitter reaches `jitter` on each axis, scaled up by the crop; the cursor stays well
    // inside half of that.
    const rawReach = Math.hypot(jitter / crop.width, jitter / crop.height)
    expect(worst).toBeLessThan(rawReach / 2)
  })

  it('follows a steady move and comes to rest where the hand stops', () => {
    // One second sweeping across the crop, then a still second.
    const sweep = Array.from({ length: 30 }, (_, i) => hand(0.7 - (0.4 * i) / 29, 0.5))
    const rest = Array(30).fill(hand(0.3, 0.5))
    let state = initialGestureState
    const xs: number[] = []
    ;[...sweep, ...rest].forEach((frame, i) => {
      state = readGesture(state, frame, i * FRAME_MS).state
      xs.push(state.cursor!.x)
    })
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]! - 1e-9)
    const target = cursorAfter(Array(10).fill(hand(0.3, 0.5)))
    const start = cursorAfter([hand(0.7, 0.5)])
    // By the end of the sweep it has covered most of the way, and at rest it has arrived.
    expect((xs[29]! - start.x) / (target.x - start.x)).toBeGreaterThan(0.75)
    expect(Math.abs(xs.at(-1)! - target.x)).toBeLessThan(0.01)
  })
})

describe('tracking lost', () => {
  const seen = feed(Array(5).fill(hand(0.5, 0.5))).state

  it(`comes after ${lostAfterFrames} frames in a row without a hand, once`, () => {
    const { events, state } = feed(Array(lostAfterFrames + 3).fill(null), seen)
    const lost = events.flat().filter((e) => e.kind === 'lost')
    expect(lost).toHaveLength(1)
    expect(events[lostAfterFrames - 1]).toEqual([{ kind: 'lost' }])
    expect(events.slice(0, lostAfterFrames - 1).flat()).toEqual([])
    expect(state.cursor).toBeNull()
  })

  it('does not come from a gap shorter than that', () => {
    const gap = [...Array(lostAfterFrames - 1).fill(null), hand(0.5, 0.5)]
    const { events, state } = feed(gap, seen)
    expect(events.flat().some((e) => e.kind === 'lost')).toBe(false)
    expect(state.cursor).not.toBeNull()
  })

  it('starts afresh when the hand comes back: the cursor jumps to it, not glides', () => {
    const lost = feed(Array(lostAfterFrames).fill(null), seen).state
    const back = feed([hand(0.3, 0.5)], lost).state.cursor!
    expect(back).toEqual(cursorAfter([hand(0.3, 0.5)]))
  })

  it('is never reported before any hand was seen', () => {
    const { events } = feed(Array(lostAfterFrames * 2).fill(null))
    expect(events.flat()).toEqual([])
  })
})

describe('the pinch', () => {
  const { pinch } = HAND_TUNING
  /** The palm's length (wrist to index knuckle), in camera-frame heights. */
  const PALM = 0.15
  /** A visitor's open thumb–index gap, as a share of the palm. */
  const OPEN = 0.9

  /**
   * A hand whose index fingertip is at (x, y) in the camera's own picture, with the thumb's tip
   * below it at `gap` times the palm's length (the pinch ratio the reader should measure).
   */
  const pose = (x: number, y: number, gap: number): HandFrame =>
    Array.from({ length: 21 }, (_, i) => {
      if (i === INDEX_TIP) return { x, y }
      if (i === THUMB_TIP) return { x, y: y + gap * PALM }
      if (i === INDEX_KNUCKLE) return { x, y: y + 0.2 }
      if (i === WRIST) return { x, y: y + 0.2 + PALM }
      return { x, y: y + 0.1 }
    })
  const still = (gap: number, frames: number) => Array<HandFrame>(frames).fill(pose(0.5, 0.5, gap))
  const kinds = (events: GestureEvent[][]) => events.flat().map((e) => e.kind)
  const count = (events: GestureEvent[][], kind: GestureEvent['kind']) =>
    kinds(events).filter((k) => k === kind).length

  /** A hand shown open long enough to calibrate on `open`. */
  const calibrated = (open = OPEN) => feed(still(open, pinch.calibrationFrames)).state

  describe('calibration', () => {
    it.each([0.7, OPEN, 1.2])(
      'sets the threshold to about a third of the open gap (%s palms)',
      (open) => {
        const state = calibrated(open)
        expect(state.threshold! / open).toBeCloseTo(1 / 3, 2)
        // Just under a third closes the fingers; just over doesn't.
        expect(count(feed(still(open * 0.3, 10), state).events, 'pinch')).toBe(1)
        expect(count(feed(still(open * 0.36, 10), state).events, 'pinch')).toBe(0)
      },
    )

    it('waits for the open hand: no pinch before it has measured the gap', () => {
      const { events, state } = feed(still(OPEN * 0.1, pinch.calibrationFrames - 1))
      expect(count(events, 'pinch')).toBe(0)
      expect(state.threshold).toBeNull()
    })

    it('keeps the threshold within its range, whatever the hand read', () => {
      expect(calibrated(0.01).threshold).toBe(pinch.threshold.min)
      expect(calibrated(10).threshold).toBe(pinch.threshold.max)
    })

    it('survives tracking lost: the hand comes back calibrated', () => {
      const lost = feed(Array(lostAfterFrames).fill(null), calibrated()).state
      expect(lost.threshold).toBeCloseTo(OPEN / 3, 2)
    })
  })

  describe('the fingers', () => {
    const { click, frame: crop, pinch: tuning } = HAND_TUNING
    const threshold = OPEN * tuning.calibrationShare
    const closed = threshold * 0.5
    const band = (t: number) => threshold * (1 + (tuning.openFactor - 1) * t)
    /** Calibrated, then pinched and held long enough to be sure it closed. */
    const pinched = () => feed(still(closed, tuning.confirmFrames + 1), calibrated()).state

    it('never flicker while the gap oscillates inside the hysteresis band', () => {
      // Every frame somewhere between the threshold and the opening gap, never outside it.
      const next = noise(5)
      const inside = Array.from({ length: 90 }, () => pose(0.5, 0.5, band(0.5 + 0.45 * next())))
      const open = feed(inside, calibrated())
      expect(kinds(open.events).filter((k) => k !== 'move')).toEqual([])
      expect(open.state.pinch).toBeNull()
      const held = feed(inside, pinched())
      expect(kinds(held.events).filter((k) => k !== 'move' && k !== 'grab')).toEqual([])
      expect(held.state.pinch).not.toBeNull()
    })

    it('close once, and stay closed, while a noisy gap hovers around the threshold', () => {
      const next = noise(9)
      const hovering = Array.from({ length: 90 }, () =>
        pose(0.5, 0.5, threshold * (1 + 0.3 * next())),
      )
      const { events } = feed(hovering, calibrated())
      expect(count(events, 'pinch')).toBe(1)
      expect(count(events, 'click') + count(events, 'release')).toBe(0)
    })

    it('never change on one frame alone', () => {
      // One closed frame between open ones, again and again: never a pinch.
      const blinks = Array.from({ length: 40 }, (_, i) => pose(0.5, 0.5, i % 2 ? closed : OPEN))
      expect(kinds(feed(blinks, calibrated()).events).filter((k) => k !== 'move')).toEqual([])
      // One open frame in a held pinch, again and again: it stays held.
      const flashes = Array.from({ length: 40 }, (_, i) => pose(0.5, 0.5, i % 2 ? OPEN : closed))
      const held = feed(flashes, pinched())
      expect(count(held.events, 'click') + count(held.events, 'release')).toBe(0)
      expect(held.state.pinch).not.toBeNull()
    })

    it(`change after ${tuning.confirmFrames} frames in a row`, () => {
      const { events } = feed(still(closed, tuning.confirmFrames), calibrated())
      expect(events[tuning.confirmFrames - 1]!.some((e) => e.kind === 'pinch')).toBe(true)
      expect(count(events, 'pinch')).toBe(1)
    })

    /** Frames that close the fingers, hold them `hold` frames, and open them again. */
    const tap = (hold: number) => [
      ...still(closed, tuning.confirmFrames + hold),
      ...still(OPEN, tuning.confirmFrames + 5),
    ]
    /** Held frames that keep a pinch (confirmed on its last closing frame) under `ms` long. */
    const framesUnder = (ms: number) => Math.floor(ms / FRAME_MS) - tuning.confirmFrames - 1

    it('a quick, still pinch gives exactly one click, and no grab', () => {
      const { events } = feed(tap(framesUnder(click.maxMs)), calibrated())
      expect(count(events, 'pinch')).toBe(1)
      expect(count(events, 'click')).toBe(1)
      expect(count(events, 'grab') + count(events, 'release')).toBe(0)
    })

    it('a long pinch is a grab: no click, and it lets go with a release', () => {
      const { events } = feed(tap(Math.ceil(click.maxMs / FRAME_MS) + 3), calibrated())
      expect(count(events, 'click')).toBe(0)
      expect(count(events, 'release')).toBe(1)
    })

    it('a travelling pinch gives grab deltas that follow the hand, and no click', () => {
      // Pinch, move the hand up a tenth of the frame in a fifth of a second, rest, let go.
      const rise = 0.1
      const moving = Array.from({ length: 6 }, (_, i) =>
        pose(0.5, 0.5 - (rise * (i + 1)) / 6, closed),
      )
      const { events } = feed(
        [
          ...still(closed, tuning.confirmFrames),
          ...moving,
          ...Array<HandFrame>(30).fill(pose(0.5, 0.5 - rise, closed)),
          ...Array<HandFrame>(tuning.confirmFrames + 3).fill(pose(0.5, 0.5 - rise, OPEN)),
        ],
        calibrated(),
      )
      expect(count(events, 'click')).toBe(0)
      expect(count(events, 'release')).toBe(1)
      const grabs = events.flat().flatMap((e) => (e.kind === 'grab' ? [e.up] : []))
      expect(grabs.length).toBeGreaterThan(1)
      // Up is positive, and in all it is how far the hand moved, in screen heights.
      expect(grabs.reduce((a, b) => a + b, 0)).toBeCloseTo(rise / crop.height, 2)
      // The grab starts while the hand travels, not only once the pinch is long.
      const firstGrab = events.findIndex((step) => step.some((e) => e.kind === 'grab'))
      expect(firstGrab).toBeLessThan(tuning.calibrationFrames + tuning.confirmFrames + 6)
    })

    it('a release comes before the loss when the hand leaves mid-grab, and no click', () => {
      const grabbing = feed(still(closed, Math.ceil(click.maxMs / FRAME_MS) + 3), calibrated())
      const { events } = feed(Array(lostAfterFrames).fill(null), grabbing.state)
      expect(kinds(events)).toEqual(['release', 'lost'])
    })

    describe('the grab anchor', () => {
      // The fingers close the natural way: the index tip comes down and the thumb comes up to meet
      // halfway, so the fingertip travels about half the open gap (far more than a click's travel)
      // while the thumb–index midpoint stays put.
      const tipY = 0.5
      const meet = tipY + (OPEN * PALM) / 2
      const closing = (steps: number) =>
        Array.from({ length: steps }, (_, i) => {
          const gap = OPEN * (1 - (i + 1) / steps)
          return pose(0.5, meet - (gap * PALM) / 2, gap)
        })
      const pinchedAt = pose(0.5, meet, 0)

      /** The last cursor reported before the first event of `kind`, in the flattened stream. */
      const cursorBefore = (events: GestureEvent[][], kind: GestureEvent['kind']) => {
        const flat = events.flat()
        const at = flat.findIndex((e) => e.kind === kind)
        const move = flat.slice(0, at).findLast((e) => e.kind === 'move')
        return move?.kind === 'move' ? move.point : null
      }

      it('ignores the fingers closing: a click lands where the cursor was before', () => {
        const before = feed(still(OPEN, 30), calibrated())
        const aimed = before.state.cursor!
        const { events } = feed(
          [...closing(5), pinchedAt, pinchedAt, ...closing(5).reverse(), ...still(OPEN, 3)],
          before.state,
        )
        expect(count(events, 'click')).toBe(1)
        const clicked = cursorBefore(events, 'click')!
        expect(Math.hypot(clicked.x - aimed.x, clicked.y - aimed.y)).toBeLessThan(0.005)
      })

      it('ignores the fingers closing: a held grab gives no movement from it', () => {
        const before = feed(still(OPEN, 30), calibrated())
        const { events } = feed(
          [...closing(5), ...Array<HandFrame>(30).fill(pinchedAt)],
          before.state,
        )
        const grabbed = events.flat().flatMap((e) => (e.kind === 'grab' ? [e.up] : []))
        expect(Math.abs(grabbed.reduce((a, b) => a + b, 0))).toBeLessThan(0.002)
        // The cursor during the grab is where it was aimed.
        const aimed = before.state.cursor!
        const last = cursorBefore([...events, [{ kind: 'lost' }]], 'lost')!
        expect(Math.hypot(last.x - aimed.x, last.y - aimed.y)).toBeLessThan(0.005)
      })
    })
  })
})
