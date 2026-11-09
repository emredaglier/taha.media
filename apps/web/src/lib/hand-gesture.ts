import { HAND_TUNING } from './hand-tuning'
import { oneEuro, type OneEuroState } from './one-euro'

/** One hand landmark, 0 to 1 across and down the camera's own (unmirrored) picture. */
export type Landmark = { readonly x: number; readonly y: number }

/** The 21 landmarks of one hand in one camera frame (MediaPipe's hand model order). */
export type HandFrame = readonly Landmark[]

/** Landmarks the reader uses, in MediaPipe's hand model. */
export const WRIST = 0
export const THUMB_TIP = 4
export const INDEX_KNUCKLE = 5
export const INDEX_TIP = 8
export const PINKY_KNUCKLE = 17

/** A point on screen, 0 to 1 across and down the viewport. */
export type ScreenPoint = { x: number; y: number }

/** What the hand did in one camera frame. */
export type GestureEvent =
  /** The cursor is here now. */
  | { kind: 'move'; point: ScreenPoint }
  /** The hand has been out of view for a few frames: the cursor is gone until it is back. */
  | { kind: 'lost' }
  /** The fingers closed: a pinch began (a click or a grab, as it turns out). */
  | { kind: 'pinch' }
  /** A quick, still pinch let go: click where the cursor is. */
  | { kind: 'click' }
  /**
   * A grab moved `up` screen heights since the last one (negative: down), and `right` screen
   * widths (negative: left; #59, the Galeri lightbox steps on it). `since` marks the
   * catch-up: the first delta, which brings in at once what the cursor moved from the anchor since
   * the pinch began (`since`, ms) until it turned out to be a grab, so its speed is spread over
   * that time, not over one frame.
   */
  | { kind: 'grab'; up: number; right: number; since?: number }
  /**
   * A grab let go (or the hand left the camera mid-grab). `steadyAt` is the time (ms) of its last
   * steady frame: the release itself comes a few frames later, once the fingers have surely opened.
   */
  | { kind: 'release'; steadyAt: number }

/** A point in the mirrored camera frame, 0 to 1. */
type FramePoint = { x: number; y: number }

/** A pinch in progress. */
type Pinch = {
  /** When the fingers closed (ms). */
  startedAt: number
  /** Where the cursor was then: the anchor, in the mirrored camera frame. */
  from: FramePoint
  /** Added to the thumb–index midpoint to give the cursor while pinching. */
  offset: FramePoint
  /** The furthest the cursor has gone from `from`, in camera-frame heights. */
  travel: number
  /** Whether it has become a grab (too long or too far for a click). */
  grabbing: boolean
  /**
   * The cursor's height (camera frame) in the last steady frame: one whose gap agrees that the
   * fingers are closed. While they seem to open, the cursor's movement waits (the fingers parting
   * shift the pinch point), and if they do open it never counts.
   */
  steadyY: number
  /** The cursor's place across (camera frame) in the last steady frame. */
  steadyX: number
  /** The time (ms) of the last steady frame. */
  steadyAt: number
  /** The cursor's height (camera frame) at the last grab delta. */
  reportedY: number
  /** The cursor's place across (camera frame) at the last grab delta. */
  reportedX: number
  /** Whether the grab's first delta (the catch-up since the anchor) has gone out. */
  caughtUp: boolean
  /** The point (camera frame) the cursor has stayed within `rest.radius` of, for the rest guard. */
  restPoint: FramePoint
  /** Since when (ms) it has stayed there. */
  restSince: number
}

/** One frame with open fingers, kept briefly to find where the cursor was before a pinch. */
type Recent = { at: number; point: FramePoint; ratio: number }

export type GestureState = {
  /** The cursor's filters, in the mirrored camera frame; null until a hand is seen. */
  filter: { x: OneEuroState; y: OneEuroState } | null
  /** Camera frames in a row without a hand. */
  missed: number
  /** The cursor, or null while no hand is tracked. */
  cursor: ScreenPoint | null
  /** The calibrated pinch threshold (gap ÷ palm), or null until it is measured. */
  threshold: number | null
  /** The gaps measured so far for the calibration. */
  samples: number[]
  /** Camera frames in a row whose gap disagrees with the pinch state. */
  streak: number
  /** The pinch in progress, or null while the fingers are open. */
  pinch: Pinch | null
  /** Recent frames with open fingers (within the anchor window). */
  recent: Recent[]
  /** The last pinch's end: the cursor eases from where it was back to the fingertip. */
  released: { at: number; offset: FramePoint } | null
  /** Since when (ms) the fingers have been wide open in a row (arming), or null while they aren't. */
  wideSince: number | null
  /**
   * The time (ms) of the last frame of a wide-open run that lasted `arm.ms`: the arming, or null
   * while there is none (never, used up by a pinch, or lost with tracking).
   */
  armedAt: number | null
  /**
   * Whether the closed fingers are being ignored: they closed (or the rest guard let go) without
   * the arming, and haven't opened since. No pinch, click, grab or release comes of them.
   */
  ignoring: boolean
  /**
   * Whether the hand is engaged: false while its closed fingers are ignored, so a hand resting in
   * a pinch doesn't keep Hand control on (`lib/hand-lifetime.ts`). Any other hand, open anywhere
   * in view or pinching for real, is.
   */
  engaged: boolean
}

export const initialGestureState: GestureState = {
  filter: null,
  missed: 0,
  cursor: null,
  threshold: null,
  samples: [],
  streak: 0,
  pinch: null,
  recent: [],
  released: null,
  wideSince: null,
  armedAt: null,
  ignoring: false,
  engaged: true,
}

const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v))

/** The `p` percentile (0 to 1) of `values`, interpolated between the nearest two. */
const percentile = (values: readonly number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  const at = (sorted.length - 1) * p
  const below = sorted[Math.floor(at)]!
  const above = sorted[Math.ceil(at)]!
  return below + (above - below) * (at - Math.floor(at))
}

/** The distance between two landmarks in camera pixels (the picture asked for). */
const pixels = (a: Landmark, b: Landmark) => {
  const { width, height } = HAND_TUNING.camera
  return Math.hypot((a.x - b.x) * width, (a.y - b.y) * height)
}

/** The thumb–index gap as a share of the palm (wrist to index knuckle). */
const pinchRatio = (hand: HandFrame) =>
  pixels(hand[THUMB_TIP]!, hand[INDEX_TIP]!) /
  Math.max(pixels(hand[WRIST]!, hand[INDEX_KNUCKLE]!), 1)

/** A distance in the camera frame, in camera-frame heights. */
const heights = (a: FramePoint, b: FramePoint) => {
  const { width, height } = HAND_TUNING.camera
  return Math.hypot((a.x - b.x) * (width / height), a.y - b.y)
}

/**
 * How big the hand is in the picture, in camera-frame heights: the longer of its palm's length
 * (wrist to index knuckle) and its width (index to pinky knuckle), so a hand tilted towards the
 * camera doesn't read small. A hand far from the camera does (the "Biraz yaklaş" hint, #58).
 */
export const palmSize = (hand: HandFrame): number =>
  Math.max(
    heights(hand[WRIST]!, hand[INDEX_KNUCKLE]!),
    heights(hand[INDEX_KNUCKLE]!, hand[PINKY_KNUCKLE]!),
  )

/** Where a camera-frame point lands on screen: the middle of the frame spans the whole screen. */
const toScreen = (point: FramePoint): ScreenPoint => {
  const { frame } = HAND_TUNING
  return {
    x: clamp((point.x - frame.left) / frame.width, 0, 1),
    y: clamp((point.y - frame.top) / frame.height, 0, 1),
  }
}

/**
 * Where the cursor was just before the fingers began to close: in the last open frame whose gap
 * was still within `anchorSlack` of the widest gap of the anchor window, but no more than
 * `anchorMaxAgeMs` before `closedAt` (the first frame of the closing), else the frame at that cap.
 */
const anchorOf = (
  recent: readonly Recent[],
  closedAt: number,
  fallback: FramePoint,
): FramePoint => {
  const { anchorSlack, anchorMaxAgeMs } = HAND_TUNING.pinch
  if (recent.length === 0) return fallback
  const widest = Math.max(...recent.map((frame) => frame.ratio))
  const open = recent.findLast((frame) => frame.ratio >= widest * (1 - anchorSlack))
  if (open && closedAt - open.at <= anchorMaxAgeMs) return open.point
  const capped = recent.find((frame) => closedAt - frame.at <= anchorMaxAgeMs)
  return capped?.point ?? fallback
}

/** A filter that sits at `value` from `now`, with no speed. */
const seeded = (value: number, now: number): OneEuroState => ({ value, speed: 0, at: now })

/**
 * The gesture reader (#56, #57): one camera frame in, the cursor and the gestures out. Pure: `now`
 * is the frame's time in ms.
 *
 * - **Cursor:** the index fingertip, mirrored (the visitor sees themself as in a mirror), steadied
 *   by a one-euro filter and mapped from the middle of the camera frame onto the whole screen, so
 *   hand movements stay small. After `lostAfterFrames` frames in a row without a hand, tracking is
 *   lost once (letting go of any grab), and the filters start afresh when the hand is back.
 * - **Pinch:** the thumb–index gap over the palm, against a threshold calibrated from the first
 *   frames with a hand (a third of the open gap). Closed below the threshold, open above
 *   `openFactor` times it, and only after `confirmFrames` frames in a row, so it never flickers.
 * - **While pinching** the cursor follows the thumb–index midpoint, anchored where the cursor was
 *   just before the fingers began to close: closing them doesn't move it.
 * - **Arming (#75):** a pinch counts only if the fingers were wide open just before: a gap of at
 *   least `arm`'s (the larger of `gapFactor` × the threshold and `gapMin`) for `arm.ms`, ending no
 *   more than `arm.holdMs` before the fingers began to close. Otherwise the closed fingers are
 *   ignored (no `pinch`, `click`, `grab` or `release`, no anchoring, the cursor on the fingertip)
 *   until they open. A pinch uses its arming up; tracking lost loses it (the threshold stays).
 * - **Rest guard (#75):** a grab whose cursor stays within `rest.radius` of one point for
 *   `rest.ms` is a hand resting: a `release`, then its closed fingers are ignored until the hand
 *   has been wide open again.
 * - **Engaged (#75):** `state.engaged` is false while the closed fingers are being ignored (unarmed
 *   or after the rest guard), so the no-hand timer doesn't count a hand resting in a pinch.
 * - **Click:** a pinch let go within `click.maxMs`, having moved less than `click.maxTravel`. Any
 *   other pinch becomes a grab once it is too long or too far, and reports how far the cursor moves
 *   up and right (`grab`, screen heights and widths, from the anchor on) until it lets go
 *   (`release`). Never dwell.
 */
export function readGesture(
  state: GestureState,
  hand: HandFrame | null,
  now: number,
): { state: GestureState; events: GestureEvent[] } {
  const { pinch: tuning, click, frame, arm, rest } = HAND_TUNING
  const tip = hand?.[INDEX_TIP]
  if (!hand || !tip || hand.length < 21) {
    const missed = state.missed + 1
    if (state.filter && missed >= HAND_TUNING.lostAfterFrames) {
      // Calibration is the visitor's, not the moment's: it outlives the lost hand.
      const { pinch } = state
      const events: GestureEvent[] = pinch?.grabbing
        ? [{ kind: 'release', steadyAt: pinch.steadyAt }]
        : []
      events.push({ kind: 'lost' })
      return {
        state: { ...initialGestureState, threshold: state.threshold, samples: state.samples },
        events,
      }
    }
    return { state: { ...state, missed }, events: [] }
  }

  const events: GestureEvent[] = []
  const ratio = pinchRatio(hand)
  let { threshold, samples, streak, pinch, released, filter, wideSince, armedAt, ignoring } = state

  // Calibration: the first frames with a hand measure the open gap.
  if (threshold === null) {
    samples = [...samples, ratio]
    if (samples.length >= tuning.calibrationFrames) {
      threshold = clamp(
        percentile(samples, tuning.calibrationPercentile) * tuning.calibrationShare,
        tuning.threshold.min,
        tuning.threshold.max,
      )
    }
  }

  const thumb = hand[THUMB_TIP]!
  const fingertip: FramePoint = { x: 1 - tip.x, y: tip.y }
  const midpoint: FramePoint = { x: 1 - (tip.x + thumb.x) / 2, y: (tip.y + thumb.y) / 2 }
  const lastPoint = filter ? { x: filter.x.value, y: filter.y.value } : fingertip

  // Arming: a run of wide-open frames lasting `arm.ms` arms the next pinch.
  if (threshold !== null && state.threshold !== null) {
    if (ratio >= Math.max(arm.gapFactor * threshold, arm.gapMin)) {
      wideSince ??= now
      if (now - wideSince >= arm.ms) armedAt = now
    } else wideSince = null
  }

  // The fingers: a change counts once it has held for `confirmFrames` frames in a row. Closed
  // fingers that are ignored (no arming) count as closed, so they open and close like a pinch.
  let changed = false
  const wasClosed = pinch !== null || ignoring
  if (threshold !== null && state.threshold !== null) {
    const closed = wasClosed ? ratio < threshold * tuning.openFactor : ratio < threshold
    streak = closed === wasClosed ? 0 : streak + 1
    changed = streak >= tuning.confirmFrames
    if (changed) streak = 0
  }

  // Closed, but without the arming: the fingers are ignored until they open.
  let armed = false
  let closedAt = now
  if (changed && !wasClosed) {
    // The closing began with the run of closed frames that confirmed it (this one and those just
    // before): the arming must not have ended more than `arm.holdMs` before.
    for (let i = state.recent.length - 1; i >= 0 && state.recent[i]!.ratio < threshold!; i--) {
      closedAt = state.recent[i]!.at
    }
    armed = armedAt !== null && closedAt - armedAt <= arm.holdMs
    if (!armed) ignoring = true
  } else if (changed && ignoring) ignoring = false

  if (changed && !pinch && armed) {
    // Closed: hold on to where the cursor was before the fingers began to close. Each pinch uses
    // its arming up.
    armedAt = null
    wideSince = null
    const from = anchorOf(state.recent, closedAt, lastPoint)
    pinch = {
      startedAt: now,
      from,
      offset: { x: from.x - midpoint.x, y: from.y - midpoint.y },
      travel: 0,
      grabbing: false,
      steadyY: from.y,
      steadyX: from.x,
      steadyAt: now,
      reportedY: from.y,
      reportedX: from.x,
      caughtUp: false,
      restPoint: from,
      restSince: now,
    }
    filter = { x: seeded(from.x, now), y: seeded(from.y, now) }
    released = null
    events.push({ kind: 'pinch' })
  } else if (changed && pinch) {
    // Opened: a quick, still pinch clicks; any other was (or now turns out to be) a grab.
    const quick = now - pinch.startedAt < click.maxMs && pinch.travel < click.maxTravel
    if (!pinch.grabbing && quick) events.push({ kind: 'click' })
    else {
      if (!pinch.grabbing) {
        const up = (pinch.reportedY - pinch.steadyY) / frame.height
        const right = (pinch.steadyX - pinch.reportedX) / frame.width
        if (up !== 0 || right !== 0)
          events.push({ kind: 'grab', up, right, since: pinch.startedAt })
      }
      events.push({ kind: 'release', steadyAt: pinch.steadyAt })
    }
    released = { at: now, offset: { x: lastPoint.x - fingertip.x, y: lastPoint.y - fingertip.y } }
    pinch = null
  }

  // The cursor: the anchored pinch point while pinching, otherwise the fingertip (easing back to
  // it after a pinch).
  let target: FramePoint
  if (pinch) {
    target = { x: midpoint.x + pinch.offset.x, y: midpoint.y + pinch.offset.y }
  } else {
    const k = released ? Math.max(0, 1 - (now - released.at) / tuning.releaseEaseMs) : 0
    const offset = released?.offset ?? { x: 0, y: 0 }
    target = { x: fingertip.x + offset.x * k, y: fingertip.y + offset.y * k }
    if (k === 0) released = null
  }
  const { filter: params } = HAND_TUNING
  if (!(changed && pinch)) {
    filter = {
      x: oneEuro(filter?.x ?? null, target.x, now, params),
      y: oneEuro(filter?.y ?? null, target.y, now, params),
    }
  }
  const point: FramePoint = { x: filter!.x.value, y: filter!.y.value }
  const cursor = toScreen(point)
  events.push({ kind: 'move', point: cursor })

  // A pinch becomes a grab once it is too long or has gone too far for a click, and from then on
  // reports the cursor's movement, from the anchor on. Only steady frames move it.
  if (pinch) {
    const steady = streak === 0
    let { travel, grabbing, steadyY, steadyX, steadyAt, reportedY, reportedX, caughtUp } = pinch
    if (steady) {
      travel = Math.max(travel, heights(point, pinch.from))
      steadyY = point.y
      steadyX = point.x
      steadyAt = now
    }
    if (!grabbing && (now - pinch.startedAt >= click.maxMs || travel >= click.maxTravel)) {
      grabbing = true
    }
    if (grabbing && steady) {
      // The first delta brings in, at once, the drift since the anchor.
      const up = (reportedY - steadyY) / frame.height
      const right = (steadyX - reportedX) / frame.width
      if (up !== 0 || right !== 0) {
        events.push(
          caughtUp
            ? { kind: 'grab', up, right }
            : { kind: 'grab', up, right, since: pinch.startedAt },
        )
        caughtUp = true
      }
      reportedY = steadyY
      reportedX = steadyX
    }
    // The rest guard: a cursor that stays within `rest.radius` of one point lets go.
    let { restPoint, restSince } = pinch
    if (heights(point, restPoint) > rest.radius) {
      restPoint = point
      restSince = now
    }
    if (grabbing && now - restSince >= rest.ms) {
      // A hand resting, not grabbing: it lets go as if its fingers opened (the page can't glide
      // from a rest: it hasn't moved by more than the radius in `rest.ms`), and its closed
      // fingers are ignored until they open and arm again.
      events.push({ kind: 'release', steadyAt })
      released = { at: now, offset: { x: point.x - fingertip.x, y: point.y - fingertip.y } }
      pinch = null
      ignoring = true
      streak = 0
    } else {
      pinch = {
        ...pinch,
        travel,
        grabbing,
        steadyY,
        steadyX,
        steadyAt,
        reportedY,
        reportedX,
        caughtUp,
        restPoint,
        restSince,
      }
    }
  }

  // Open frames, briefly: the next pinch's anchor is among them.
  const recent = pinch
    ? []
    : [...state.recent, { at: now, point, ratio }].filter(
        (frame) => now - frame.at <= tuning.anchorWindowMs,
      )

  return {
    state: {
      filter,
      missed: 0,
      cursor,
      threshold,
      samples,
      streak,
      pinch,
      recent,
      released,
      wideSince,
      armedAt,
      ignoring,
      engaged: !ignoring,
    },
    events,
  }
}
