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

export type HandWatch = {
  /** When a hand was last in view, the watch began, or the coach opened or closed (ms). */
  lastHandAt: number
  /** Whether the coach was open at the last frame. */
  coach: boolean
  done: boolean
}

/** A hand watch begun at `now` (ms): the count starts there. */
export const startHandWatch = (now: number): HandWatch => ({
  lastHandAt: now,
  coach: false,
  done: false,
})

/**
 * One camera frame at `now`, with a hand in view or not, and the coach open or not: `noHandMs`
 * without a hand turns Hand control off, once, or `coachNoHandMs` while the coach is open (the
 * visitor may be reading it). A hand in view, or the coach opening or closing, starts the count
 * afresh.
 */
export function watchHand(
  state: HandWatch,
  { seen, coach }: { seen: boolean; coach: boolean },
  now: number,
): Step<HandWatch> {
  const { noHandMs, coachNoHandMs } = HAND_TUNING.lifetime
  if (state.done) return { state, event: null }
  const lastHandAt = seen || coach !== state.coach ? now : state.lastHandAt
  const next = { ...state, lastHandAt, coach }
  if (now - lastHandAt < (coach ? coachNoHandMs : noHandMs)) return { state: next, event: null }
  return { state: { ...next, done: true }, event: { kind: 'off', reason: 'noHand' } }
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
  /** When the recent gaps of `pauseMs` or more ended (ms), within `pauseWindowMs`. */
  gaps: number[]
  done: boolean
}

/**
 * A frame-rate watch begun at `now` (ms): when Hand control turned on, or after the window's focus
 * changed (the browser may have stopped drawing it meanwhile).
 */
export const startFrameRateWatch = (now: number): FrameRateWatch => ({
  measureFrom: now + HAND_TUNING.lifetime.graceMs,
  last: now,
  windowStart: now,
  frames: 0,
  slowSince: null,
  gaps: [],
  done: false,
})

/**
 * One page frame (an animation frame) at `now`. The frame rate is counted over windows of
 * `sampleMs`, after a grace; a run of windows under `minFps` lasting `slowMs` turns Hand control
 * off, once, as not smooth, and any window that keeps up ends the run. Display rates (60, 120,
 * 144 Hz) don't matter: only frames per second count.
 *
 * A gap of `pauseMs` or more between two frames is a pause (the browser stopped drawing), not a
 * slow page: the grace starts again after it. But when such gaps recur (`pauseRepeats` within
 * `pauseWindowMs`), the page is simply that slow: the gap is slow time, in the same run.
 */
export function watchFrameRate(state: FrameRateWatch, now: number): Step<FrameRateWatch> {
  const { minFps, slowMs, sampleMs, pauseMs, pauseRepeats, pauseWindowMs } = HAND_TUNING.lifetime
  if (state.done) return { state, event: null }
  let next: FrameRateWatch
  if (now - state.last >= pauseMs) {
    const gaps = [...state.gaps.filter((at) => now - at < pauseWindowMs), now]
    if (gaps.length < pauseRepeats)
      return { state: { ...startFrameRateWatch(now), gaps }, event: null }
    const slowSince = state.slowSince ?? state.last
    next = { ...state, last: now, windowStart: now, frames: 0, slowSince, gaps }
  } else if (now < state.measureFrom) {
    return { state: { ...state, last: now, windowStart: now, frames: 0 }, event: null }
  } else {
    const frames = state.frames + 1
    const span = now - state.windowStart
    if (span < sampleMs) return { state: { ...state, last: now, frames }, event: null }
    const slow = (frames * 1000) / span < minFps
    const slowSince = slow ? (state.slowSince ?? state.windowStart) : null
    next = { ...state, last: now, windowStart: now, frames: 0, slowSince }
  }
  if (next.slowSince !== null && now - next.slowSince >= slowMs) {
    return { state: { ...next, done: true }, event: { kind: 'off', reason: 'notSmooth' } }
  }
  return { state: next, event: null }
}
