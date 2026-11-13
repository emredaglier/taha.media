import { ROOM_TUNING } from './room-tuning'

/**
 * The Edit Room's opening (#131): pure functions of time, no GSAP, no Three.js. The renderer draws
 * what `openingAt` says; the clock is the only state.
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
const quartInOut = (x: number) => (x < 0.5 ? 8 * x ** 4 : 1 - 8 * (1 - x) ** 4)

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

/** Where the opening is: seconds since it began. */
export type OpeningClock = { seconds: number }

/** A clock at the start; for a visitor who comes back to the room, already at the end. */
export const createOpening = (atRest: boolean): OpeningClock => ({
  seconds: atRest ? OPENING_SECONDS : 0,
})

/** Moves the clock on by a frame; a bad `dt` moves it by nothing. */
export function stepOpening(clock: OpeningClock, dt: number): void {
  if (dt > 0) clock.seconds = Math.min(OPENING_SECONDS, clock.seconds + dt)
}

/** A click or tap: jumps to the finished room. */
export function skipOpening(clock: OpeningClock): void {
  clock.seconds = OPENING_SECONDS
}

/** Whether the opening is still running: until it is over no Work can be chosen, and a click skips it. */
export const isOpening = (clock: OpeningClock): boolean => clock.seconds < OPENING_SECONDS
