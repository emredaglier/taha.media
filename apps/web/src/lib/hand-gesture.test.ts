import { describe, expect, it } from 'vitest'

import {
  INDEX_TIP,
  initialGestureState,
  readGesture,
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
