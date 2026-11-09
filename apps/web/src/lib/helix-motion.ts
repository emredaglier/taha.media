import { cardOnScreen } from './helix-geometry'
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

/**
 * The opening (#54): the Showreel full-bleed zooms out into the Helix, then melts away.
 * - `hero`: the page scrolls, and the zoom follows the scroll (`scroll`, 0 to 1 of the zoom's
 *   scroll length) with time-based easing (`zoom`, 0 the Showreel full-bleed, 1 on the front card).
 * - `melt`: the Showreel melts away by itself from `startedAt` (ms). The point of no return: no
 *   input brings `hero` back, only a reset. Turning works from here on.
 * - `helix`: the Showreel is gone.
 */
export type HelixPhase =
  | { kind: 'hero'; scroll: number; zoom: number }
  | { kind: 'melt'; startedAt: number }
  | { kind: 'helix' }

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
  /** Where the opening is. While it is in `hero`, the zoom sets `progress` (the spin). */
  phase: HelixPhase
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
  /**
   * The page scrolled: `fraction` of the zoom's scroll length (0 at the top, 1 at its end). Only
   * the opening's `hero` follows it.
   */
  | { kind: 'scroll'; fraction: number }
  /** Back to the start of the opening, the Showreel full-bleed (the logo on Home). */
  | { kind: 'reset' }

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
/**
 * Scatters the cards' appearing: the stride through them is about this share of their count (the
 * golden ratio's conjugate, which spreads a stride's steps most evenly).
 */
const SCATTER_STRIDE = 0.618

const mod = (value: number, by: number) => ((value % by) + by) % by
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
const inOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const smoothstep = (t: number) => t * t * (3 - 2 * t)
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/** Where the Helix is during the zoom: it spins forward into place as the camera pulls back. */
const spunAt = (zoom: number) => -HELIX_TUNING.zoomSpinCards * (1 - smoothstep(zoom))

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
    phase: { kind: 'helix' },
  }
}

/**
 * A Helix of `works` Featured Works at the start of the opening: the Showreel full-bleed, the
 * zoom at 0. The opening lands with the first Work in front.
 */
export function createOpening(works: number): HelixState {
  return {
    ...createHelix(works, 0),
    progress: spunAt(0),
    phase: { kind: 'hero', scroll: 0, zoom: 0 },
  }
}

/**
 * How Home starts: in `helix` with the remembered Work in front when coming back to a history entry
 * that opened one (`remembered`, its place among the Works), otherwise with the opening.
 */
export function startHelix(works: number, remembered: number | null): HelixState {
  return remembered !== null &&
    Number.isInteger(remembered) &&
    remembered >= 0 &&
    remembered < works
    ? createHelix(works, remembered)
    : createOpening(works)
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

/**
 * One sub-step of the opening, `dt` seconds ending at wall-clock time `at` (ms). In `hero` the
 * zoom eases towards the scroll (exact at any step length), and the Helix spins with it; once the
 * page has scrolled to the end and the zoom is nearly done, the zoom lands and the melt starts.
 * The melt ends by the clock.
 */
function unfold(state: HelixState, dt: number, at: number): HelixState {
  const { phase } = state
  switch (phase.kind) {
    case 'helix':
      return state
    case 'melt':
      return at - phase.startedAt < HELIX_TUNING.meltSeconds * 1000
        ? state
        : { ...state, phase: { kind: 'helix' } }
    case 'hero': {
      const zoom =
        phase.zoom + (phase.scroll - phase.zoom) * (1 - Math.exp(-dt * HELIX_TUNING.zoomRate))
      if (phase.scroll >= HELIX_TUNING.meltStartScroll && zoom > HELIX_TUNING.meltStartZoom) {
        // The point of no return: the Showreel sits on the first card in front, and melts.
        return { ...state, progress: 0, speed: 0, phase: { kind: 'melt', startedAt: at } }
      }
      const progress = spunAt(zoom)
      return {
        ...state,
        progress,
        speed: (progress - state.progress) / dt,
        phase: { ...phase, zoom },
      }
    }
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
    const at = state.time + step * dt * 1000
    next = integrate(unfold(next, dt, at), dt, at)
  }
  return { ...next, time: now }
}

/**
 * An input during the opening's `hero`: the scroll moves the zoom, and focus on a Work's link
 * skips the opening (a keyboard user is never stuck behind the zoom), as coming back to a
 * remembered Work does. Turning input waits for the melt.
 */
function duringHero(state: HelixState, input: HelixInput): HelixState {
  if (state.phase.kind !== 'hero') return state
  switch (input.kind) {
    case 'scroll':
      return { ...state, phase: { ...state.phase, scroll: clamp(input.fraction, 0, 1) } }
    case 'focus':
      return { ...createHelix(state.works, mod(input.work, state.works)), time: state.time }
    default:
      return state
  }
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
  if (input.kind === 'reset') return { ...createOpening(current.works), time: current.time }
  if (current.phase.kind === 'hero') return duringHero(current, input)
  switch (input.kind) {
    case 'frame':
      return current
    case 'scroll':
      // From the melt on the page no longer scrolls the zoom: there is no way back to `hero`.
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

/** What the front Work's live region does after a step. */
export type LiveRegion = { speak: number } | 'clear' | 'keep'

/**
 * What the front Work's live region should do after a step from `before` to `after`: speak the
 * Work the Helix came to rest on (`arrived`), clear what it said when the model forgot it without
 * a new stop (a reset, or a focus that skipped the opening), or leave it. Without the clearing, a
 * later stop on the same Work would set the same words, which changes nothing in the page, and a
 * screen reader would stay silent.
 */
export function liveRegionAfter(before: HelixState, after: HelixState): LiveRegion {
  if (after.arrived !== null) return { speak: after.arrived }
  return after.announced !== before.announced ? 'clear' : 'keep'
}

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

/**
 * The cards on screen, as far as the Preview loops go: the visible band, once the zoom is done.
 * While it runs, the Showreel has the screen and the opening starts from the posters.
 */
const onScreenCards = (state: HelixState): number[] =>
  state.phase.kind === 'hero' ? [] : visibleCards(state)

/** The Works of `cards`, each once. */
const worksOf = (state: HelixState, cards: readonly number[]): Set<number> =>
  new Set(cards.map((card) => workOfCard(state, card)))

/**
 * The cards in the sharp middle band (#55): those whose picture reaches within `band` of the
 * middle of the screen, top to bottom (0 to 1 of the half-height; the tuned sharp band), where the
 * glyph mosaic doesn't melt it. `focal` is the screen's focal length: where cards are smaller on
 * screen (phones), more of them reach in. None while the zoom runs: the Showreel has the middle.
 */
export function sharpCards(
  state: HelixState,
  focal: number,
  band: number = HELIX_TUNING.sharpBand,
): number[] {
  return onScreenCards(state).filter((card) => {
    // The screen's shape only moves cards sideways; 1 stands in for it.
    const box = cardOnScreen(slotOf(state, card), focal, 1)
    return box !== null && Math.abs(box.y) - box.halfHeight <= band
  })
}

/**
 * The cards that play their Work's Preview loop (#55): those in the sharp band (`sharpCards`,
 * `band` as there), and the hovered card (the one the pointer rests on) while it is on screen.
 */
export function liveCards(
  state: HelixState,
  focal: number,
  hovered: number | null,
  band: number = HELIX_TUNING.sharpBand,
): number[] {
  const cards = sharpCards(state, focal, band)
  return hovered === null || cards.includes(hovered) || !onScreenCards(state).includes(hovered)
    ? cards
    : [...cards, hovered]
}

/**
 * The Featured Works whose Preview loops play: the Works of the live cards (`liveCards`). Repeated
 * cards share their Work's one loop, so this never holds more Works than there are.
 */
export const playingWorks = (
  state: HelixState,
  focal: number,
  hovered: number | null,
  band: number = HELIX_TUNING.sharpBand,
): Set<number> => worksOf(state, liveCards(state, focal, hovered, band))

/** The Preview loops after a step: which cards play, which Works play, and whose frame is held. */
export type PreviewLoops = {
  /** The cards that play their Work's loop (`liveCards`). */
  live: number[]
  /** The Works whose loops play (`playingWorks`). */
  playing: Set<number>
  /**
   * The Works whose loop frame is kept: those that play, and those that stopped but still have a
   * card on screen. A card of a Work that stopped shows its loop's last frame, frozen; once none of
   * its cards is on screen the frame goes, and its cards show the poster again. So the frames held
   * never outnumber the cards on screen.
   */
  held: Set<number>
}

/**
 * The Preview loops for the Helix now (#55), from the hovered card and the Works whose frames were
 * held after the last step (`held`; none at first). See `PreviewLoops`.
 */
export function previewLoops(
  state: HelixState,
  focal: number,
  hovered: number | null,
  held: ReadonlySet<number>,
  band: number = HELIX_TUNING.sharpBand,
): PreviewLoops {
  const live = liveCards(state, focal, hovered, band)
  const playing = worksOf(state, live)
  const onScreen = worksOf(state, onScreenCards(state))
  return {
    live,
    playing,
    held: new Set([...playing, ...[...held].filter((work) => onScreen.has(work))]),
  }
}

/**
 * Whether card `card` shows its Work's loop (playing, or frozen on its last frame) rather than its
 * poster: a live card does, and so does a card of a Work that stopped and whose frame is held. A
 * repeat of a Work that plays on another card shows the poster: the loop is moving there.
 */
export function showsLoop(state: HelixState, loops: PreviewLoops, card: number): boolean {
  const work = workOfCard(state, card)
  return loops.live.includes(card) || (!loops.playing.has(work) && loops.held.has(work))
}

/** What the opening looks like now: what the renderer, the overlays and the page read. */
export type Opening = {
  /** The camera's pull-back, eased: 0 the Showreel full-bleed, 1 the Helix in place. */
  zoom: number
  /** How far the Showreel has melted away, 0 to 1. */
  melt: number
  /**
   * Where the Showreel is drawn, in slots: the front slot while it zooms, then on its card (the
   * first, which it landed on) while it melts, so it rides the card as the Helix turns. Null once
   * it has melted away.
   */
  showreelSlot: number | null
  /** How far the hero's overlays (name, ©, Statement, "Sesli izle") have left: 0 to 1. */
  heroGone: number
  /** Whether the front Work's overlay shows: once the Helix is in place. */
  frontShown: boolean
  /** Whether the page is locked and the Helix takes the wheel, drags and arrow keys: from the melt on. */
  locked: boolean
}

export function openingOf(state: HelixState): Opening {
  const { phase } = state
  switch (phase.kind) {
    case 'hero':
      return {
        zoom: smoothstep(phase.zoom),
        melt: 0,
        showreelSlot: 0,
        heroGone: smoothstep(clamp(phase.zoom / HELIX_TUNING.heroLeavesBy, 0, 1)),
        frontShown: false,
        locked: false,
      }
    case 'melt': {
      const melt = clamp(
        ((state.time ?? phase.startedAt) - phase.startedAt) / (HELIX_TUNING.meltSeconds * 1000),
        0,
        1,
      )
      return {
        zoom: 1,
        melt,
        showreelSlot: slotOf(state, 0),
        heroGone: 1,
        frontShown: melt > HELIX_TUNING.frontShowsAt,
        locked: true,
      }
    }
    case 'helix':
      return { zoom: 1, melt: 1, showreelSlot: null, heroGone: 1, frontShown: true, locked: true }
  }
}

/**
 * Where card `card` comes in during the zoom (0 to 1 of it): the first card, which the Showreel
 * lands on, at once, the others in a scattered order that is the same on every visit (a stride
 * through them that shares no factor with their count).
 */
function appearsAt(state: HelixState, card: number): number {
  const index = mod(card, state.cards)
  const others = state.cards - 1
  if (index === 0 || others < 1) return 0
  let stride = Math.max(1, Math.round(others * SCATTER_STRIDE))
  while (gcd(stride, others) !== 1) stride++
  const rank = ((index - 1) * stride) % others
  return HELIX_TUNING.appearFrom + (rank / state.cards) * HELIX_TUNING.appearSpread
}

/**
 * How present card `card` is: 0 not there yet, 1 fully there. During the zoom the cards appear
 * around the shrinking Showreel with staggered delays; from the melt on they are all there.
 */
export function cardPresence(state: HelixState, card: number): number {
  if (state.phase.kind !== 'hero') return 1
  return clamp((state.phase.zoom - appearsAt(state, card)) / HELIX_TUNING.appearSpan, 0, 1)
}
