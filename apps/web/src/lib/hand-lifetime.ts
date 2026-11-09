import { HAND_TUNING } from './hand-tuning'

/*
 * How long Hand control lasts (#58), as pure watches over time: the controller feeds them the
 * camera frames and the page's animation frames (ms, one clock), and maps an `off` to the
 * lifecycle's event of the same name. Every number is in `HAND_TUNING.lifetime`.
 */

/** Why a watch turns Hand control off. */
export type LifetimeReason = 'noHand' | 'notSmooth'

export type LifetimeEvent = { kind: 'off'; reason: LifetimeReason }

type Step<S> = { state: S; event: LifetimeEvent | null }

/** When a hand was last in view, or when the watch began. */
export type HandWatch = { lastHandAt: number; done: boolean }

/** A hand watch begun at `now` (ms): the count starts there. */
export const startHandWatch = (now: number): HandWatch => ({ lastHandAt: now, done: false })

/**
 * One camera frame at `now`, with a hand in view or not: `noHandMs` without one turns Hand control
 * off, once. A hand in view starts the count afresh.
 */
export function watchHand(state: HandWatch, seen: boolean, now: number): Step<HandWatch> {
  if (seen) return { state: { ...state, lastHandAt: now }, event: null }
  if (state.done || now - state.lastHandAt < HAND_TUNING.lifetime.noHandMs) {
    return { state, event: null }
  }
  return { state: { ...state, done: true }, event: { kind: 'off', reason: 'noHand' } }
}

export type FrameRateWatch = {
  /** No measuring before this (ms): the grace after turning on, or after a pause. */
  measureFrom: number
  /** The previous page frame (ms). */
  last: number
  /** The window being counted: when it began, and the frames since. */
  windowStart: number
  frames: number
  /** When the run of slow windows began, or null while the page keeps up. */
  slowSince: number | null
  done: boolean
}

/** A frame-rate watch begun at `now` (ms), the moment Hand control turned on. */
export const startFrameRateWatch = (now: number): FrameRateWatch => ({
  measureFrom: now + HAND_TUNING.lifetime.graceMs,
  last: now,
  windowStart: now,
  frames: 0,
  slowSince: null,
  done: false,
})

/**
 * One page frame (an animation frame) at `now`. The frame rate is counted over windows of
 * `sampleMs`, after a grace; a run of windows under `minFps` lasting `slowMs` turns Hand control
 * off, once, as not smooth, and any window that keeps up ends the run. A gap of `pauseMs` or more
 * between two frames is a pause (the browser stopped drawing), not a slow page: the grace starts
 * again after it. Display rates (60, 120, 144 Hz) don't matter: only frames per second count.
 */
export function watchFrameRate(state: FrameRateWatch, now: number): Step<FrameRateWatch> {
  const { minFps, slowMs, sampleMs, pauseMs } = HAND_TUNING.lifetime
  if (state.done) return { state, event: null }
  if (now - state.last >= pauseMs) return { state: startFrameRateWatch(now), event: null }
  if (now < state.measureFrom) {
    return { state: { ...state, last: now, windowStart: now, frames: 0 }, event: null }
  }
  const frames = state.frames + 1
  const span = now - state.windowStart
  if (span < sampleMs) return { state: { ...state, last: now, frames }, event: null }
  const slow = (frames * 1000) / span < minFps
  const slowSince = slow ? (state.slowSince ?? state.windowStart) : null
  const next = { ...state, last: now, windowStart: now, frames: 0, slowSince }
  if (slowSince !== null && now - slowSince >= slowMs) {
    return { state: { ...next, done: true }, event: { kind: 'off', reason: 'notSmooth' } }
  }
  return { state: next, event: null }
}
