import { describe, expect, it } from 'vitest'

import { CHIN_GAP, hold, PALM, pose, resting, type RestMotion } from './hand-fixtures'
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

describe('the pinch', () => {
  const { pinch } = HAND_TUNING
  const share = pinch.calibrationShare
  /** A visitor's open thumb–index gap, as a share of the palm. */
  const OPEN = 0.9

  const { arm, rest } = HAND_TUNING
  /** Frames of a wide-open hand that are surely `arm.ms` long (#75). */
  const armFrames = Math.ceil(arm.ms / FRAME_MS) + 2
  /** Frames that surely last `ms`. */
  const framesOf = (ms: number) => Math.ceil(ms / FRAME_MS) + 1

  const still = (gap: number, frames: number) => hold(pose(0.5, 0.5, gap), frames)
  const kinds = (events: GestureEvent[][]) => events.flat().map((e) => e.kind)
  const count = (events: GestureEvent[][], kind: GestureEvent['kind']) =>
    kinds(events).filter((k) => k === kind).length
  /** The index of the first camera frame whose events include one of `kind`. */
  const firstEvent = (events: GestureEvent[][], kind: GestureEvent['kind']) =>
    events.findIndex((step) => step.some((e) => e.kind === kind))
  /** The kinds of event that matter: not the cursor's moves, nor the loss of tracking. */
  const quiet = (events: GestureEvent[][]) => [
    ...new Set(kinds(events).filter((k) => k !== 'move' && k !== 'lost')),
  ]
  /** A hand resting in a pinch (#75), and the ways it rests. */
  const CHIN = CHIN_GAP
  const motions: RestMotion[] = ['still', 'drift', 'sway']

  /** A hand shown open long enough to calibrate on `open`, and then wide open long enough to arm. */
  const calibrated = (open = OPEN) =>
    feed([...still(open, pinch.calibrationFrames), ...still(open, armFrames)]).state
  /** A hand shown open long enough to calibrate on `open` and no more: not armed (#75). */
  const calibratedOnly = (open = OPEN) => feed(still(open, pinch.calibrationFrames)).state

  describe('calibration', () => {
    it.each([0.7, OPEN, 1.2])(
      'sets the threshold to its share of the open gap (%s palms)',
      (open) => {
        const state = calibrated(open)
        expect(state.threshold! / open).toBeCloseTo(share, 6)
        // Just under the share closes the fingers; just over doesn't.
        expect(count(feed(still(open * share * 0.9, 10), state).events, 'pinch')).toBe(1)
        expect(count(feed(still(open * share * 1.1, 10), state).events, 'pinch')).toBe(0)
      },
    )

    it('reads the open gap from the open frames when the hand starts pinched or in a fist', () => {
      // Most of the calibration closed, then open: pinching works as for an open start.
      const closedFrames = Math.ceil(pinch.calibrationFrames / 2)
      const { state } = feed([
        ...still(OPEN * share * 0.2, closedFrames),
        ...still(OPEN, pinch.calibrationFrames - closedFrames),
        // (#75) The pinch needs a wide-open run first: the calibration's own frames don't count.
        ...still(OPEN, armFrames),
      ])
      expect(state.threshold! / OPEN).toBeCloseTo(share, 6)
      expect(count(feed(still(OPEN * share * 0.9, 10), state).events, 'pinch')).toBe(1)
    })

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
      expect(lost.threshold).toBeCloseTo(OPEN * share, 6)
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
      // A held pinch, a still hand: the only change is the rest guard's one release (#75), at
      // rest.ms after the pinch began. The noisy gap flickers nothing.
      const start = pinched()
      const from = clock
      const held = feed(inside, start)
      expect(kinds(held.events).filter((k) => k !== 'move' && k !== 'grab')).toEqual(['release'])
      const releasedAt = from + (firstEvent(held.events, 'release') + 1) * FRAME_MS
      expect(releasedAt - start.pinch!.startedAt).toBeGreaterThanOrEqual(rest.ms)
      expect(releasedAt - start.pinch!.startedAt).toBeLessThan(rest.ms + 2 * FRAME_MS)
    })

    it('close once, and stay closed, while a noisy gap hovers around the threshold', () => {
      const next = noise(9)
      const hovering = Array.from({ length: 90 }, () =>
        pose(0.5, 0.5, threshold * (1 + 0.3 * next())),
      )
      const { events } = feed(hovering, calibrated())
      // One pinch, and the rest guard's one release rest.ms later (#75): nothing else.
      expect(kinds(events).filter((k) => k !== 'move' && k !== 'grab')).toEqual([
        'pinch',
        'release',
      ])
      const held = (firstEvent(events, 'release') - firstEvent(events, 'pinch')) * FRAME_MS
      expect(held).toBeGreaterThanOrEqual(rest.ms)
      expect(held).toBeLessThan(rest.ms + 2 * FRAME_MS)
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
          ...hold(pose(0.5, 0.5 - rise, closed), 30),
          ...hold(pose(0.5, 0.5 - rise, OPEN), tuning.confirmFrames + 3),
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

    it('a sideways pinch gives horizontal grab deltas: right positive, as on screen (#59)', () => {
      // Pinch, move the hand a tenth of the frame to its own left (the camera's right: the screen's
      // left, mirrored) in a fifth of a second, rest, let go.
      const sweep = 0.1
      const moving = Array.from({ length: 6 }, (_, i) =>
        pose(0.5 + (sweep * (i + 1)) / 6, 0.5, closed),
      )
      const { events } = feed(
        [
          ...still(closed, tuning.confirmFrames),
          ...moving,
          ...hold(pose(0.5 + sweep, 0.5, closed), 30),
          ...hold(pose(0.5 + sweep, 0.5, OPEN), tuning.confirmFrames + 3),
        ],
        calibrated(),
      )
      expect(count(events, 'click')).toBe(0)
      const grabs = events.flat().flatMap((e) => (e.kind === 'grab' ? [e] : []))
      expect(grabs.length).toBeGreaterThan(1)
      // In all, how far the hand moved, in screen widths: leftwards on screen, so negative.
      const right = grabs.reduce((sum, e) => sum + e.right, 0)
      expect(right).toBeCloseTo(-sweep / crop.width, 2)
      // Nothing moved up or down.
      expect(Math.abs(grabs.reduce((sum, e) => sum + e.up, 0))).toBeLessThan(1e-9)
    })

    it('a release comes before the loss when the hand leaves mid-grab, and no click', () => {
      const grabbing = feed(still(closed, Math.ceil(click.maxMs / FRAME_MS) + 3), calibrated())
      const { events } = feed(Array(lostAfterFrames).fill(null), grabbing.state)
      expect(kinds(events)).toEqual(['release', 'lost'])
    })

    it('a pinch that is not yet a grab ends with the loss alone when the hand leaves', () => {
      const pinching = feed(still(closed, tuning.confirmFrames + 1), calibrated())
      const { events } = feed(Array(lostAfterFrames).fill(null), pinching.state)
      expect(kinds(events)).toEqual(['lost'])
    })

    it("marks a grab's first delta, the drift since the pinch began, as a catch-up", () => {
      // Held past a click's length while drifting slowly up, then held still.
      const frames = Math.ceil(click.maxMs / FRAME_MS) + 3
      const drift = Array.from({ length: frames }, (_, i) =>
        pose(0.5, 0.5 - (0.02 * (i + 1)) / frames, closed),
      )
      const { events } = feed(
        [...still(closed, tuning.confirmFrames), ...drift, ...hold(drift.at(-1)!, 3)],
        calibrated(),
      )
      const grabs = events.flat().filter((e) => e.kind === 'grab')
      const pinchedAt = clock - (frames + 3) * FRAME_MS
      expect(grabs[0]!.since).toBeCloseTo(pinchedAt, 6)
      expect(grabs.slice(1).every((e) => e.since === undefined)).toBe(true)
    })

    it('a release tells when its last steady frame was: before the fingers began to open', () => {
      const grabbing = feed(still(closed, Math.ceil(click.maxMs / FRAME_MS) + 3), calibrated())
      const lastSteady = clock
      const { events } = feed(still(OPEN, tuning.confirmFrames), grabbing.state)
      const release = events.flat().find((e) => e.kind === 'release')
      expect(release).toEqual({ kind: 'release', steadyAt: lastSteady })
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
        const { events } = feed([...closing(5), ...hold(pinchedAt, 30)], before.state)
        const grabbed = events.flat().flatMap((e) => (e.kind === 'grab' ? [e.up] : []))
        expect(Math.abs(grabbed.reduce((a, b) => a + b, 0))).toBeLessThan(0.002)
        // The cursor during the grab is where it was aimed.
        const aimed = before.state.cursor!
        const last = cursorBefore([...events, [{ kind: 'lost' }]], 'lost')!
        expect(Math.hypot(last.x - aimed.x, last.y - aimed.y)).toBeLessThan(0.005)
      })

      it(`reaches back no more than ${pinch.anchorMaxAgeMs} ms before the fingers closed`, () => {
        // The hand sweeps 0.3 of the width in 300 ms, its gap relaxing early in the sweep, then
        // pinches: the widest gap is before the sweep, far back, but the anchor stays in the cap.
        const start = feed(hold(pose(0.65, 0.5, OPEN), 30), calibrated())
        const sweepFrames = Math.round(300 / FRAME_MS)
        const sweep = Array.from({ length: sweepFrames }, (_, i) => {
          const t = (i + 1) / sweepFrames
          return pose(0.65 - 0.3 * t, 0.5, OPEN - (OPEN - 0.72) * Math.min(1, 3 * t))
        })
        const times: number[] = []
        const cursors: ScreenPoint[] = []
        let state = start.state
        for (const frame of [...sweep, ...hold(pose(0.35, 0.5, closed), tuning.confirmFrames)]) {
          clock += FRAME_MS
          state = readGesture(state, frame, clock).state
          times.push(clock)
          cursors.push(state.cursor!)
        }
        const closedAt = times[sweepFrames]!
        const anchored = cursors.at(-1)!
        // The frame whose cursor the pinch took: within the cap before the closing.
        const taken = cursors.findIndex(
          (c) => Math.hypot(c.x - anchored.x, c.y - anchored.y) < 1e-9,
        )
        expect(taken).toBeLessThan(sweepFrames)
        expect(closedAt - times[taken]!).toBeLessThanOrEqual(pinch.anchorMaxAgeMs)
      })
    })
  })

  describe('arming (#75)', () => {
    const threshold = OPEN * pinch.calibrationShare
    const sceneFrames = framesOf(2000)

    /** Three ways a hand can come to the chin already pinched, as the state it starts from. */
    const starts: Record<string, () => GestureState> = {
      'after calibrating on an open hand': () =>
        // Open for the calibration, then relaxed for longer than an arming holds: not wide open.
        feed(still(threshold * 1.2, framesOf(arm.holdMs) + 5), calibratedOnly()).state,
      'after tracking was lost and the hand came back': () =>
        feed(Array(lostAfterFrames).fill(null), calibrated()).state,
      'as the very first hand ever seen': () => initialGestureState,
    }

    describe.each(Object.entries(starts))('a hand at the chin %s', (_, start) => {
      it.each(motions)('(%s) gives no pinch, click or grab, and is not engaged', (motion) => {
        const { events, state } = feed(resting(motion, sceneFrames), start())
        expect(quiet(events)).toEqual([])
        expect(state.pinch).toBeNull()
        expect(state.engaged).toBe(false)
      })

      it.each(motions)(
        '(%s) with fingers parting for under arm.ms and touching again still gives nothing',
        (motion) => {
          const chin = resting(motion, sceneFrames)
          const { events } = feed(
            [...chin, ...still(OPEN, 2), ...chin, ...still(OPEN, 2), ...chin],
            start(),
          )
          expect(quiet(events)).toEqual([])
        },
      )

      it('is never engaged, even when tracking drops out again and again', () => {
        // 20 frames in view, 6 out (a lost track), over and over, well past the no-hand timer.
        const cycle = [...resting('sway', 20), ...Array(lostAfterFrames + 1).fill(null)]
        const cycles = Math.ceil(HAND_TUNING.lifetime.noHandMs / (cycle.length * FRAME_MS)) + 5
        let state = start()
        for (let i = 0; i < cycles; i++) {
          for (const frame of cycle) {
            clock += FRAME_MS
            state = readGesture(state, frame, clock).state
            if (frame) expect(state.engaged).toBe(false)
          }
        }
      })

      it('follows the fingertip as an open hand does', () => {
        const { state } = feed(resting('still', sceneFrames, { x: 0.4, y: 0.4 }), start())
        const open = cursorAfter(hold(pose(0.4, 0.4, OPEN), 10))
        expect(state.cursor!.x).toBeCloseTo(open.x, 3)
        expect(state.cursor!.y).toBeCloseTo(open.y, 3)
      })
    })

    describe('engaged', () => {
      const engagedAt = (frames: readonly HandFrame[], from?: GestureState) =>
        feed(frames, from).state.engaged

      it('is true for an open hand, wide open or not, calibrating or calibrated', () => {
        expect(engagedAt(still(OPEN, 3))).toBe(true)
        expect(engagedAt(still(OPEN, pinch.calibrationFrames))).toBe(true)
        expect(engagedAt(still(threshold * 1.2, 20), calibratedOnly())).toBe(true)
        expect(engagedAt(still(OPEN, armFrames), calibratedOnly())).toBe(true)
      })

      it('is false for a pinched first hand from its very first frame, while it calibrates', () => {
        for (let frames = 1; frames <= pinch.calibrationFrames + 3; frames++) {
          expect(engagedAt(resting('still', frames))).toBe(false)
        }
        // A gap clearly under arm.gapMin is not open, one over it is.
        expect(engagedAt(still(arm.gapMin * 0.9, 5))).toBe(false)
        expect(engagedAt(still(arm.gapMin * 1.1, 5))).toBe(true)
      })

      it('is false on the first frame of a hand back from a lost track, pinched', () => {
        const lost = feed(Array(lostAfterFrames).fill(null), calibrated()).state
        expect(engagedAt(still(CHIN, 1), lost)).toBe(false)
      })

      it('is true for an armed pinch, from its first closing frame on, and for a grab', () => {
        expect(engagedAt(still(CHIN, 1), calibrated())).toBe(true)
        expect(engagedAt(still(CHIN, 4), calibrated())).toBe(true)
        expect(engagedAt(still(CHIN, framesOf(HAND_TUNING.click.maxMs) + 3), calibrated())).toBe(
          true,
        )
      })

      it('is false again once the rest guard has let go, and true when the fingers open', () => {
        const rested = feed(resting('still', framesOf(rest.ms) + 5), calibrated()).state
        expect(rested.engaged).toBe(false)
        expect(engagedAt(still(OPEN, 3), rested)).toBe(true)
      })
    })

    it('a real pinch from a hand wide open for arm.ms clicks when quick and still', () => {
      const tap = [...still(CHIN, 4), ...still(OPEN, 5)]
      const { events } = feed(tap, calibratedOnly())
      // Not yet armed: nothing.
      expect(quiet(events)).toEqual([])
      const armed = feed([...still(OPEN, armFrames), ...tap], calibratedOnly())
      expect(count(armed.events, 'pinch')).toBe(1)
      expect(count(armed.events, 'click')).toBe(1)
    })

    it('does not arm on a wide-open run shorter than arm.ms', () => {
      const short = Math.floor(arm.ms / FRAME_MS) - 1
      const { events } = feed([...still(OPEN, short), ...still(CHIN, 6)], calibratedOnly())
      expect(quiet(events)).toEqual([])
    })

    it('stays armed for arm.holdMs after the open run, and no longer', () => {
      const wait = (ms: number) =>
        feed(
          [...still(OPEN, armFrames), ...still(threshold * 1.2, framesOf(ms)), ...still(CHIN, 4)],
          calibratedOnly(),
        ).events
      expect(count(wait(arm.holdMs * 0.5), 'pinch')).toBe(1)
      expect(count(wait(arm.holdMs + 200), 'pinch')).toBe(0)
    })

    it('needs another wide-open run for a second pinch after a click', () => {
      const tap = [...still(CHIN, 4), ...still(OPEN, 3)]
      const again = feed([...tap, ...tap], calibrated())
      expect(count(again.events, 'click')).toBe(1)
      expect(count(again.events, 'pinch')).toBe(1)
      const rearmed = feed([...tap, ...still(OPEN, armFrames), ...tap], calibrated())
      expect(count(rearmed.events, 'click')).toBe(2)
    })

    it('needs another wide-open run for a second pinch after a release', () => {
      const grab = [...still(CHIN, framesOf(HAND_TUNING.click.maxMs) + 3), ...still(OPEN, 3)]
      const again = feed([...grab, ...still(CHIN, 8)], calibrated())
      expect(count(again.events, 'release')).toBe(1)
      expect(count(again.events, 'pinch')).toBe(1)
      const rearmed = feed([...grab, ...still(OPEN, armFrames), ...still(CHIN, 8)], calibrated())
      expect(count(rearmed.events, 'pinch')).toBe(2)
    })

    it('lets a visitor whose threshold sits at its floor arm with a fully open hand', () => {
      // The smallest open gap that calibrates to the floor.
      const open = pinch.threshold.min / pinch.calibrationShare
      const state = feed(still(open, pinch.calibrationFrames)).state
      expect(state.threshold).toBe(pinch.threshold.min)
      const { events } = feed(
        [...still(open, armFrames), ...still(CHIN, 4), ...still(open, 4)],
        state,
      )
      expect(count(events, 'click')).toBe(1)
    })

    it('does not let a threshold at its floor arm on a half-open hand', () => {
      const open = pinch.threshold.min / pinch.calibrationShare
      const state = feed(still(open, pinch.calibrationFrames)).state
      const half = arm.gapMin * 0.8
      const { events } = feed([...still(half, armFrames * 2), ...still(CHIN, 8)], state)
      expect(quiet(events)).toEqual([])
    })

    it('stays armed through a pinch that is a grab: deltas, scrolling and stepping are as before', () => {
      const rise = 0.1
      const moving = Array.from({ length: 6 }, (_, i) =>
        pose(0.5, 0.5 - (rise * (i + 1)) / 6, CHIN),
      )
      const { events } = feed(
        [
          ...still(CHIN, 2),
          ...moving,
          ...hold(pose(0.5, 0.5 - rise, CHIN), 20),
          ...hold(pose(0.5, 0.5 - rise, OPEN), 5),
        ],
        calibrated(),
      )
      const ups = events.flat().flatMap((e) => (e.kind === 'grab' ? [e.up] : []))
      expect(ups.reduce((a, b) => a + b, 0)).toBeCloseTo(rise / HAND_TUNING.frame.height, 2)
      expect(count(events, 'release')).toBe(1)
    })

    it('is lost with tracking: an armed hand that leaves and returns pinched is ignored', () => {
      const { events } = feed(
        [...Array(lostAfterFrames).fill(null), ...still(CHIN, 20)],
        calibrated(),
      )
      expect(quiet(events)).toEqual([])
    })
  })

  describe('the rest guard (#75)', () => {
    const FRAMES_REST = framesOf(rest.ms)

    it.each(motions)('(%s) lets a resting grab go with a release after rest.ms', (motion) => {
      const frames = resting(motion, FRAMES_REST + 40)
      const { events, state } = feed(frames, calibrated())
      expect(count(events, 'pinch')).toBe(1)
      expect(count(events, 'release')).toBe(1)
      expect(count(events, 'click')).toBe(0)
      // Not before rest.ms has passed since the pinch began, and soon after.
      const pinchedAt = firstEvent(events, 'pinch')
      const heldFor = (firstEvent(events, 'release') - pinchedAt) * FRAME_MS
      expect(heldFor).toBeGreaterThanOrEqual(rest.ms)
      expect(heldFor).toBeLessThan(rest.ms + 3 * FRAME_MS)
      // Then nothing more, and the hand is not engaged.
      expect(
        events
          .slice(firstEvent(events, 'release') + 1)
          .flat()
          .every((e) => e.kind === 'move'),
      ).toBe(true)
      expect(state.pinch).toBeNull()
      expect(state.engaged).toBe(false)
    })

    it('does not let go of a grab that keeps moving', () => {
      // Sweeping across the frame for three times rest.ms: always further than the radius.
      const frames = framesOf(rest.ms * 3)
      const sweep = Array.from({ length: frames }, (_, i) =>
        pose(0.5 + 0.2 * Math.sin(i * 0.1), 0.5, CHIN),
      )
      const { events } = feed([...still(CHIN, 3), ...sweep], calibrated())
      expect(count(events, 'release')).toBe(0)
    })

    it('lets go rest.ms after a moving grab comes to a stop', () => {
      const rise = 0.1
      const moving = Array.from({ length: 6 }, (_, i) =>
        pose(0.5, 0.5 - (rise * (i + 1)) / 6, CHIN),
      )
      const { events } = feed(
        [...still(CHIN, 2), ...moving, ...hold(pose(0.5, 0.5 - rise, CHIN), FRAMES_REST + 30)],
        calibrated(),
      )
      expect(count(events, 'release')).toBe(1)
      const grabs = events.flat().flatMap((e) => (e.kind === 'grab' ? [e.up] : []))
      expect(grabs.reduce((a, b) => a + b, 0)).toBeCloseTo(rise / HAND_TUNING.frame.height, 2)
    })

    it('says its release must not glide, whatever the last moments looked like', () => {
      const { events } = feed(resting('still', FRAMES_REST + 10), calibrated())
      const release = events.flat().find((e) => e.kind === 'release')
      expect(release).toEqual({ kind: 'release', steadyAt: expect.any(Number), glide: false })
    })

    it('ignores the closed fingers until the hand has been wide open for arm.ms', () => {
      const frames = resting('sway', FRAMES_REST + 10)
      const rested = feed(frames, calibrated()).state
      // Staying closed, or parting for under arm.ms and touching again: nothing.
      const stays = feed(
        [...resting('sway', FRAMES_REST), ...still(OPEN, 2), ...still(CHIN, 20)],
        rested,
      )
      expect(quiet(stays.events)).toEqual([])
      // Wide open for arm.ms, then a pinch counts again.
      const armed = feed([...still(OPEN, armFrames), ...still(CHIN, 4), ...still(OPEN, 4)], rested)
      expect(count(armed.events, 'click')).toBe(1)
    })

    it('does not let go of a deliberate pinch shorter than rest.ms', () => {
      const { events } = feed(resting('still', framesOf(rest.ms * 0.8)), calibrated())
      expect(count(events, 'release')).toBe(0)
      expect(count(events, 'grab')).toBe(0)
    })
  })
})
