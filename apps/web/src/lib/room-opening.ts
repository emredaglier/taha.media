import { HOLD_PROGRESS, type RoomScroll } from './room-model'
import { quartInOut } from './room-pointing'
import { ROOM_TUNING } from './room-tuning'

/**
 * The Edit Room's opening (#131): pure functions of its position (seconds), no GSAP, no Three.js.
 * The renderer draws what `openingAt` says. Time plays it to the hold on the Showreel; from there
 * the room's scroll scrubs the rest, and scrolling back up past the path's start returns to the
 * hold (#140).
 */

/** What the room looks like at one moment of the opening. Every number is 0 to 1. */
export type OpeningState = {
  /** How far each place's screen has woken. */
  screens: number[]
  /** The room's light (the fill and the blinds' stripes: everything that is not a screen or the lamp). */
  room: number
  lamp: number
  /** How much of the middle monitor shows the Showreel instead of its own Work. */
  reel: number
  /** How far the camera is still at the middle monitor (1) rather than on its path (0). */
  fly: number
  /** The opening is over: this is the rest state, and nothing changes any more. */
  settled: boolean
}

const quadInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x))
const cubicOut = (x: number) => 1 - (1 - x) ** 3

/** `ease` of how far `seconds` is through the span that starts `at` and lasts `duration`: 0 before it, 1 after. */
const along = (
  seconds: number,
  { at, duration }: { at: number; duration: number },
  ease: (x: number) => number,
) => ease(Math.min(1, Math.max(0, (seconds - at) / duration)))

const { opening } = ROOM_TUNING

/** How long the opening lasts (s): until the last thing has finished. */
export const OPENING_SECONDS = Math.max(
  ...[...opening.screens, opening.pullBack, opening.room, opening.handOver, opening.lamp].map(
    ({ at, duration }) => at + duration,
  ),
)

/** A new state at rest: the room as it is after the opening. */
export const createOpeningState = (): OpeningState => ({
  screens: Array.from({ length: ROOM_TUNING.places }, () => 1),
  room: 1,
  lamp: 1,
  reel: 0,
  fly: 0,
  settled: true,
})

/** The opening `seconds` after it began, written into `out` (no allocation); at and past the end it is the rest state. */
export function openingAt(seconds: number, out: OpeningState): OpeningState {
  const time = Number.isNaN(seconds) ? 0 : seconds
  for (const screen of opening.screens) out.screens[screen.place] = along(time, screen, cubicOut)
  out.room = along(time, opening.room, quadInOut)
  out.lamp = along(time, opening.lamp, cubicOut)
  out.reel = 1 - along(time, opening.handOver, quadInOut)
  out.fly = 1 - along(time, opening.pullBack, quartInOut)
  out.settled = time >= OPENING_SECONDS
  return out
}

/** Where the opening holds on the Showreel (s), filling the view: time plays it to here, then the scroll takes over. */
export const HOLD_SECONDS = opening.pullBack.at

/** The intro's clock: seconds the opening has played by itself, up to the hold. */
export type OpeningClock = { seconds: number }

/** A clock at the start; for a room that starts at rest, already at the hold (the scroll says the rest). */
export const createOpening = (atRest: boolean): OpeningClock => ({
  seconds: atRest ? HOLD_SECONDS : 0,
})

/** Moves the clock on by a frame, up to the hold; a bad `dt` moves it by nothing. */
export function stepOpening(clock: OpeningClock, dt: number): void {
  if (dt > 0) clock.seconds = Math.min(HOLD_SECONDS, clock.seconds + dt)
}

/**
 * Where the opening is (s) for the clock and the scroll's `progress`: the clock's time until the
 * hold; then the scroll, from the hold at `HOLD_PROGRESS` to rest at the path's start and past it.
 */
export function openingSeconds(clock: OpeningClock, progress: number): number {
  if (clock.seconds < HOLD_SECONDS) return clock.seconds
  const scrubbed = 1 - progress / HOLD_PROGRESS
  // The last thousandth (about a px) counts as rest: the scroll's easing only ever nears its target.
  if (scrubbed >= 0.999) return OPENING_SECONDS
  return HOLD_SECONDS + (OPENING_SECONDS - HOLD_SECONDS) * (scrubbed > 0 ? scrubbed : 0)
}

/** A click or tap: jumps to the finished room, at the path's start if the scroll was in the opening. */
export function skipOpening(clock: OpeningClock, scroll: RoomScroll): void {
  clock.seconds = HOLD_SECONDS
  scroll.progress = Math.max(0, scroll.progress)
  scroll.target = Math.max(0, scroll.target)
}

/** Whether the opening is still running: until it is over no Work can be chosen, and a click skips it. */
export const isOpening = (clock: OpeningClock, scroll: RoomScroll): boolean =>
  openingSeconds(clock, scroll.progress) < OPENING_SECONDS
