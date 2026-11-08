import { HELIX_TUNING } from './helix-tuning'

/**
 * The Helix's motion model (#45, "The Helix: the motion model"): all of its state, and a pure
 * step function `(state, input, now) → state`. Positions are in cards: card i sits at `i`, and
 * `progress` is where the Helix is now. The renderer, the overlays and the input listeners only
 * feed it inputs and read it.
 */

/** What the Helix is doing. */
type Motion =
  | { kind: 'rest' }
  /**
   * Following the wheel or a drag: they move the goal, and the Helix eases after it. `holding`
   * while a pointer is down; `direction` is the way the latest input turned.
   */
  | {
      kind: 'follow'
      holding: boolean
      lastInputAt: number
      direction: -1 | 0 | 1
    }
  /** Easing towards a whole card after an arrow key or a click on a side card. */
  | { kind: 'tween'; from: number; to: number; startedAt: number }
  /** The settle spring, carrying the current speed into a whole card. */
  | { kind: 'settle'; to: number }

export type HelixState = {
  /** Real Featured Works (n ≥ 1). */
  works: number
  /** Cards on the Helix: the Works repeated in order until there are at least the minimum. */
  cards: number
  /** Where the Helix is, in cards. Endless: it runs past `cards` in both directions. */
  progress: number
  /** Turning speed, in cards per second. */
  speed: number
  /** Where the Helix is being pulled to right now. */
  goal: number
  motion: Motion
  /** The wall-clock time (ms) the state was last advanced to; null before the first step. */
  time: number | null
  /** The Featured Work the last input asked to open (a click on the front card, Enter), or null. */
  open: number | null
  /** The Work the Helix last came to rest on and announced (a screen reader's last word). */
  announced: number
  /**
   * The Work the Helix came to rest on in the latest step, when it is a new one (not the one
   * last announced); otherwise null. The front Work's live region speaks when this is set.
   */
  arrived: number | null
}

export type HelixInput =
  /** Time passes (one animation frame). */
  | { kind: 'frame' }
  /** An arrow key: one card forward (down the Helix, `1`) or back (`-1`). */
  | { kind: 'arrow'; step: 1 | -1 }
  /** A wheel event, as the browser reports it (`deltaMode`: 0 pixels, 1 lines, 2 pages). */
  | { kind: 'wheel'; deltaY: number; deltaMode: number }
  /** A pointer went down on the Helix. */
  | { kind: 'dragStart' }
  /** The pointer moved `up` CSS px (negative: down). Up turns forward. */
  | { kind: 'dragMove'; up: number }
  /** The pointer let go. */
  | { kind: 'dragEnd' }
  /** A click on card `card`: the front card opens its Work, any other turns to the front. */
  | { kind: 'card'; card: number }
  /** Enter: open the front Work. */
  | { kind: 'enter' }
  /** Keyboard or screen-reader focus reached the link of Work `work`: turn it to the front. */
  | { kind: 'focus'; work: number }

/** The visible band reaches at least this many slots either side of the front. */
const MIN_VISIBLE_SLOTS = 3

/** The longest stretch of time one step integrates: a stalled tab doesn't fling the Helix. */
const MAX_STEP_SECONDS = 0.1
/** The physics runs in sub-steps this long or shorter, so any frame rate turns it the same. */
const SUB_STEP_SECONDS = 1 / 240
/**
 * Close enough to a whole card, and slow enough, to call it resting there: about half a CSS pixel
 * at the front card. The spring gets this close within about twice the settle time, flicks too.
 */
const REST_DISTANCE = 2e-3
const REST_SPEED = 2e-2
/** Wheel deltas in lines or pages, in pixels (the usual line and page heights for wheel input). */
const WHEEL_LINE_PX = 40
const WHEEL_PAGE_PX = 800

const mod = (value: number, by: number) => ((value % by) + by) % by
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
const inOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** A Helix of `works` Featured Works, at rest with `frontWork` in front. */
export function createHelix(works: number, frontWork = 0): HelixState {
  const cards = works * Math.ceil(HELIX_TUNING.minCards / works)
  return {
    works,
    cards,
    progress: frontWork,
    speed: 0,
    goal: frontWork,
    motion: { kind: 'rest' },
    time: null,
    open: null,
    announced: frontWork,
    arrived: null,
  }
}

/** Turns to whole card `to`, easing in and out. */
const tweenTo = (state: HelixState, to: number, now: number): HelixState => ({
  ...state,
  motion: { kind: 'tween', from: state.goal, to, startedAt: now },
})

/** Where the Helix will come to rest if nothing else happens. */
function heading(state: HelixState): number {
  switch (state.motion.kind) {
    case 'tween':
    case 'settle':
      return state.motion.to
    case 'rest':
    case 'follow':
      return state.goal
  }
}

/**
 * Input has ended: aim for the next card in the direction of travel, unless the move left the
 * last card by less than the threshold (then spring back to it). The speed carries the aim on a
 * little, so a flick goes further than a slow drag.
 */
function settle(state: HelixState, direction: -1 | 0 | 1): HelixState {
  const { settleLookahead, settleThreshold } = HELIX_TUNING
  const x = state.goal + state.speed * settleLookahead
  const passed = x - Math.floor(x)
  const way = direction || Math.sign(state.speed)
  const to =
    way > 0
      ? Math.floor(x) + (passed > settleThreshold ? 1 : 0)
      : way < 0
        ? Math.floor(x) + (passed > 1 - settleThreshold ? 1 : 0)
        : Math.round(x)
  return { ...state, motion: { kind: 'settle', to } }
}

/** Wheel and drag move the goal; the Helix follows it until the input ends. */
function nudge(state: HelixState, cards: number, now: number, holding: boolean): HelixState {
  const previous = state.motion.kind === 'follow' ? state.motion.direction : 0
  return {
    ...state,
    goal: state.goal + cards,
    motion: {
      kind: 'follow',
      holding,
      lastInputAt: now,
      direction: cards > 0 ? 1 : cards < 0 ? -1 : previous,
    },
  }
}

/** A wheel delta in pixels, whatever unit the browser reported it in. */
const wheelPixels = ({ deltaY, deltaMode }: { deltaY: number; deltaMode: number }) =>
  deltaY * (deltaMode === 1 ? WHEEL_LINE_PX : deltaMode === 2 ? WHEEL_PAGE_PX : 1)

/** Eases progress towards the goal for `dt` seconds (exact at any step length). */
function follow(state: HelixState, dt: number): HelixState {
  const progress =
    state.progress + (state.goal - state.progress) * (1 - Math.exp(-dt * HELIX_TUNING.followRate))
  return { ...state, progress, speed: (progress - state.progress) / dt }
}

/**
 * The settle spring for `dt` seconds: critically damped, from the current speed, so the Helix
 * glides into the card instead of stopping and starting again. It rests in about the settle time.
 */
function spring(state: HelixState, to: number, dt: number): HelixState {
  const w = 4.6 / HELIX_TUNING.settleSeconds // e^-4.6 ≈ 1%: within 1% after the settle time
  const speed = state.speed + (w * w * (to - state.progress) - 2 * w * state.speed) * dt
  const progress = state.progress + speed * dt
  if (Math.abs(to - progress) < REST_DISTANCE && Math.abs(speed) < REST_SPEED) {
    return { ...state, progress: to, speed: 0, goal: to, motion: { kind: 'rest' } }
  }
  return { ...state, progress, speed, goal: to }
}

/** One sub-step of `dt` seconds, ending at wall-clock time `at` (ms). */
function integrate(state: HelixState, dt: number, at: number): HelixState {
  const { motion } = state
  switch (motion.kind) {
    case 'rest':
      return state
    case 'follow':
      // The wheel has no "let go": it has ended once no tick came for the idle gap.
      if (!motion.holding && at - motion.lastInputAt >= HELIX_TUNING.wheelIdleMs) {
        return integrate(settle(state, motion.direction), dt, at)
      }
      return follow(state, dt)
    case 'tween': {
      const t = clamp((at - motion.startedAt) / HELIX_TUNING.tweenMs, 0, 1)
      const goal = motion.from + (motion.to - motion.from) * inOutCubic(t)
      const next = follow({ ...state, goal }, dt)
      // The tween's end hands over to the spring, which lands exactly on its card.
      return t < 1 ? next : { ...next, motion: { kind: 'settle', to: motion.to } }
    }
    case 'settle':
      return spring(state, motion.to, dt)
  }
}

/** Advances the physics to `now` in short sub-steps. A `now` already passed leaves it as it is. */
function advance(state: HelixState, now: number): HelixState {
  if (state.time === null) return { ...state, time: now }
  if (now <= state.time) return state
  const elapsed = Math.min((now - state.time) / 1000, MAX_STEP_SECONDS)
  const steps = Math.ceil(elapsed / SUB_STEP_SECONDS)
  const dt = elapsed / steps
  let next = state
  for (let step = 1; step <= steps; step++) {
    next = integrate(next, dt, state.time + step * dt * 1000)
  }
  return { ...next, time: now }
}

/**
 * The step function: advances the Helix to `now` (ms, the same clock for every input), then
 * applies `input`.
 */
export function stepHelix(state: HelixState, input: HelixInput, now: number): HelixState {
  const advanced = advance(state, now)
  const restedOn = state.motion.kind !== 'rest' && isResting(advanced) ? frontWork(advanced) : null
  const arrived = restedOn !== null && restedOn !== state.announced ? restedOn : null
  const current: HelixState = {
    ...advanced,
    open: null,
    arrived,
    announced: arrived ?? state.announced,
  }
  switch (input.kind) {
    case 'frame':
      return current
    case 'arrow':
      // From where it is heading, so presses in quick succession each count.
      return tweenTo(current, Math.round(heading(current)) + input.step, now)
    case 'card': {
      // The card in front on screen opens, even while the Helix is turning away from it.
      if (Math.abs(slotOf(current, input.card)) < 0.5) {
        return { ...current, open: workOfCard(current, input.card) }
      }
      // The shortest way round: the place nearest to where the Helix is that puts this card in front.
      const laps = Math.round((current.progress - input.card) / current.cards)
      return tweenTo(current, input.card + laps * current.cards, now)
    }
    case 'focus': {
      // The nearest place to where the Helix is that puts a card of this Work in front.
      const laps = Math.round((current.progress - input.work) / current.works)
      const to = input.work + laps * current.works
      return heading(current) === to ? current : tweenTo(current, to, now)
    }
    case 'enter':
      return { ...current, open: workOfCard(current, frontCard(current)) }
    case 'wheel': {
      const holding = current.motion.kind === 'follow' && current.motion.holding
      return nudge(current, wheelPixels(input) * HELIX_TUNING.wheelScale, now, holding)
    }
    case 'dragStart':
      return nudge(current, 0, now, true)
    case 'dragMove':
      return nudge(current, input.up * HELIX_TUNING.dragScale, now, true)
    case 'dragEnd':
      // Letting go ends the input at once.
      return current.motion.kind === 'follow' ? settle(current, current.motion.direction) : current
  }
}

/** Whether the Helix is at rest on a whole card. */
export const isResting = (state: HelixState): boolean => state.motion.kind === 'rest'

/** The Featured Work card `card` shows: the Works repeat in order. */
export const workOfCard = (state: HelixState, card: number): number => mod(card, state.works)

/**
 * Where card `card` sits relative to the front, in cards: 0 in front, 1 the next one down,
 * -1 the one above. Always within half the cards either way, so the Helix wraps out of sight.
 */
export function slotOf(state: HelixState, card: number): number {
  const half = Math.floor(state.cards / 2)
  return mod(card - state.progress + half, state.cards) - half
}

/** The card in front: where the Helix is heading, so the overlays name it as soon as it turns. */
export const frontCard = (state: HelixState): number => mod(Math.round(heading(state)), state.cards)

/** The Featured Work in front (0-based, in the Editor's order): what the overlays and Enter use. */
export const frontWork = (state: HelixState): number => workOfCard(state, frontCard(state))

/** The counter `k / n`: the front Work among the real Works. */
export const counter = (state: HelixState) => ({
  current: frontWork(state) + 1,
  total: state.works,
})

/**
 * How many slots either side of the front the Helix shows (the renderer fades cards out towards
 * it, and the place where the cards wrap is always outside it). As wide as it can be with no Work
 * shown twice: n consecutive cards are n different Works. A smaller set repeats anyway, so it
 * keeps the minimum.
 */
export const visibleSlots = (state: HelixState): number =>
  Math.max(MIN_VISIBLE_SLOTS, state.works / 2)

/** The cards in the visible band around the front. */
export const visibleCards = (state: HelixState): number[] =>
  Array.from({ length: state.cards }, (_, card) => card).filter(
    (card) => Math.abs(slotOf(state, card)) < visibleSlots(state),
  )
