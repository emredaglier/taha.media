import { describe, expect, it } from 'vitest'

import {
  startFrameRateWatch,
  startHandWatch,
  watchFrameRate,
  watchHand,
  type FrameRateWatch,
  type LifetimeEvent,
} from './hand-lifetime'
import { HAND_TUNING } from './hand-tuning'

const { noHandMs, coachNoHandMs, minFps, slowMs, sampleMs, graceMs, pauseMs, pauseWindowMs } =
  HAND_TUNING.lifetime
const CAMERA_MS = 1000 / 30

describe('no hand in view', () => {
  /**
   * Camera frames from `from` for `ms`, with or without a hand, the coach open or not; the events
   * and the last state.
   */
  const camera = (
    state = startHandWatch(0),
    from: number,
    ms: number,
    seen: boolean,
    coach = false,
  ) => {
    const events: LifetimeEvent[] = []
    let now = from
    for (; now <= from + ms; now += CAMERA_MS) {
      const step = watchHand(state, { seen, coach }, now)
      state = step.state
      if (step.event) events.push(step.event)
    }
    return { state, events, now }
  }

  it(`turns it off after ${noHandMs / 1000} s without a hand, once`, () => {
    const before = camera(startHandWatch(0), 0, noHandMs - 2 * CAMERA_MS, false)
    expect(before.events).toEqual([])
    const after = camera(before.state, before.now, 1000, false)
    expect(after.events).toEqual([{ kind: 'off', reason: 'noHand' }])
  })

  it('a hand back in view before then starts the count afresh', () => {
    const almost = camera(startHandWatch(0), 0, noHandMs - 1000, false)
    const back = camera(almost.state, almost.now, 100, true)
    const again = camera(back.state, back.now, noHandMs - 1000, false)
    expect([...almost.events, ...back.events, ...again.events]).toEqual([])
    expect(camera(again.state, again.now, 1000, false).events).toEqual([
      { kind: 'off', reason: 'noHand' },
    ])
  })

  it('a hand in view all along never turns it off', () => {
    expect(camera(startHandWatch(0), 0, noHandMs * 3, true).events).toEqual([])
  })

  it(`while the coach is open it waits ${coachNoHandMs / 1000} s instead, not for ever`, () => {
    const reading = camera(startHandWatch(0), 0, coachNoHandMs - 1000, false, true)
    expect(reading.events).toEqual([])
    expect(camera(reading.state, reading.now, 2000, false, true).events).toEqual([
      { kind: 'off', reason: 'noHand' },
    ])
  })

  it('opening or closing the coach starts the count afresh', () => {
    // No hand for a while, then the coach opens ("?"), is read, and closes.
    const before = camera(startHandWatch(0), 0, noHandMs - 1000, false)
    const reading = camera(before.state, before.now, coachNoHandMs - 1000, false, true)
    const after = camera(reading.state, reading.now, noHandMs - 1000, false)
    expect([...before.events, ...reading.events, ...after.events]).toEqual([])
    expect(camera(after.state, after.now, 2000, false).events).toHaveLength(1)
  })
})

describe('a page that cannot stay smooth', () => {
  /** Page frames every `1000 / fps` ms from `from` for `ms`; the events and the last state. */
  const page = (state: FrameRateWatch, from: number, ms: number, fps: number) => {
    const events: { at: number; event: LifetimeEvent }[] = []
    let now = from
    for (; now <= from + ms; now += 1000 / fps) {
      const step = watchFrameRate(state, now)
      state = step.state
      if (step.event) events.push({ at: now, event: step.event })
    }
    return { state, events, now }
  }
  /** Started at 0 and past its grace at 60 fps. */
  const warm = () => page(startFrameRateWatch(0), 0, graceMs + 500, 60)
  const slowFps = minFps * 0.75

  it(`turns it off after ${slowMs / 1000} s under ${minFps} fps, once, saying it is not smooth`, () => {
    const start = warm()
    const slow = page(start.state, start.now, slowMs + 2 * sampleMs, slowFps)
    expect(slow.events.map(({ event }) => event)).toEqual([{ kind: 'off', reason: 'notSmooth' }])
    // Not before `slowMs` of slow frames, and not much after.
    const at = slow.events[0]!.at - start.now
    expect(at).toBeGreaterThanOrEqual(slowMs - 1000 / slowFps)
    expect(at).toBeLessThanOrEqual(slowMs + sampleMs + 1000 / slowFps)
  })

  it('a dip shorter than that does not, and the next one counts afresh', () => {
    let { state, now } = warm()
    for (let dip = 0; dip < 4; dip++) {
      const slow = page(state, now, slowMs - 2 * sampleMs, slowFps)
      const smooth = page(slow.state, slow.now, sampleMs * 2, 60)
      expect([...slow.events, ...smooth.events]).toEqual([])
      ;({ state, now } = smooth)
    }
  })

  it('one long stall is a dip, not a slow page', () => {
    const start = warm()
    const stall = page(start.state, start.now, 0, 60) // one frame
    const after = page(stall.state, stall.now + pauseMs * 0.9, slowMs * 2, 60)
    expect(after.events).toEqual([])
  })

  it('counts frames over time, not one interval at a time: a slow page on a 60 Hz screen', () => {
    // Frames land on the screen's refreshes, here two, three and three refreshes apart: some
    // single intervals are at 30 fps, but the page draws only 22.5 frames a second.
    const refresh = 1000 / 60
    const start = warm()
    let { state, now } = start
    const events: LifetimeEvent[] = []
    for (let i = 0; now - start.now < slowMs * 2; i++) {
      now += refresh * (i % 3 === 0 ? 2 : 3)
      const step = watchFrameRate(state, now)
      state = step.state
      if (step.event) events.push(step.event)
    }
    expect(events).toEqual([{ kind: 'off', reason: 'notSmooth' }])
  })

  it.each([30, 60, 120, 144])('a page at %s fps never turns it off', (hz) => {
    // 30: a browser's power-saving cap (Safari's Low Power Mode, Chrome's Energy Saver).
    expect(page(startFrameRateWatch(0), 0, 20_000, hz).events).toEqual([])
  })

  it('just above the line stays on, just under it turns off', () => {
    const start = warm()
    expect(page(start.state, start.now, slowMs * 3, minFps * 1.05).events).toEqual([])
    expect(page(start.state, start.now, slowMs * 3, minFps * 0.95).events).toHaveLength(1)
  })

  it(`the first ${graceMs / 1000} s after turning on are not measured`, () => {
    // The tracker warms up: slow from the start, the count only begins once the grace is over.
    const slow = page(startFrameRateWatch(0), 0, graceMs + slowMs + sampleMs * 2, slowFps)
    expect(slow.events).toHaveLength(1)
    expect(slow.events[0]!.at).toBeGreaterThanOrEqual(graceMs + slowMs - 1000 / slowFps)
  })

  it('a pause (no page frames for a while) restarts the grace instead of counting as slow', () => {
    const start = warm()
    const before = page(start.state, start.now, slowMs - 2 * sampleMs, slowFps)
    // The browser stopped drawing for a few seconds, then the page is slow again.
    const resumedAt = before.now + pauseMs * 3
    const after = page(before.state, resumedAt, graceMs + slowMs - 2 * sampleMs, slowFps)
    expect([...before.events, ...after.events]).toEqual([])
    // Then the count runs as usual.
    expect(page(after.state, after.now, slowMs, slowFps).events).toHaveLength(1)
  })

  it('a page at under 1 fps turns it off: recurring gaps are slow time, not pauses', () => {
    const start = warm()
    const crawl = page(start.state, start.now, slowMs * 4, 0.8)
    expect(crawl.events.map(({ event }) => event)).toEqual([{ kind: 'off', reason: 'notSmooth' }])
    expect(crawl.events[0]!.at - start.now).toBeLessThanOrEqual(slowMs * 3)
  })

  it('isolated pauses, or short freezes between smooth stretches, never turn it off', () => {
    for (const every of [pauseWindowMs * 0.6, pauseWindowMs * 0.3]) {
      let { state, now } = warm()
      for (let freeze = 0; freeze < 10; freeze++) {
        const smooth = page(state, now + pauseMs * 1.2, every, 60)
        expect(smooth.events).toEqual([])
        ;({ state, now } = smooth)
      }
    }
  })
})
