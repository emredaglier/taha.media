import { HAND_TUNING } from './hand-tuning'
import { oneEuro, type OneEuroState } from './one-euro'

/** One hand landmark, 0 to 1 across and down the camera's own (unmirrored) picture. */
export type Landmark = { readonly x: number; readonly y: number }

/** The 21 landmarks of one hand in one camera frame (MediaPipe's hand model order). */
export type HandFrame = readonly Landmark[]

/** The index fingertip in MediaPipe's hand model. */
export const INDEX_TIP = 8

/** A point on screen, 0 to 1 across and down the viewport. */
export type ScreenPoint = { x: number; y: number }

/** What the hand did in one camera frame. */
export type GestureEvent =
  /** The cursor is here now. */
  | { kind: 'move'; point: ScreenPoint }
  /** The hand has been out of view for a few frames: the cursor is gone until it is back. */
  | { kind: 'lost' }

export type GestureState = {
  /** The fingertip's filters, in the mirrored camera frame; null until a hand is seen. */
  filter: { x: OneEuroState; y: OneEuroState } | null
  /** Camera frames in a row without a hand. */
  missed: number
  /** The cursor, or null while no hand is tracked. */
  cursor: ScreenPoint | null
}

export const initialGestureState: GestureState = { filter: null, missed: 0, cursor: null }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * The gesture reader, first part (#56): one camera frame in, the cursor out. The cursor is the
 * index fingertip, mirrored (the visitor sees themself as in a mirror), steadied by a one-euro
 * filter and mapped from the middle of the camera frame onto the whole screen, so hand movements
 * stay small. After `lostAfterFrames` frames in a row without a hand, tracking is lost once, and
 * the filters start afresh when the hand is back. Pure: `now` is the frame's time in ms.
 */
export function readGesture(
  state: GestureState,
  hand: HandFrame | null,
  now: number,
): { state: GestureState; events: GestureEvent[] } {
  const tip = hand?.[INDEX_TIP]
  if (!tip) {
    const missed = state.missed + 1
    if (state.filter && missed >= HAND_TUNING.lostAfterFrames) {
      return { state: initialGestureState, events: [{ kind: 'lost' }] }
    }
    return { state: { ...state, missed }, events: [] }
  }

  const { filter: params, frame } = HAND_TUNING
  const mirroredX = 1 - tip.x
  const filter = {
    x: oneEuro(state.filter?.x ?? null, mirroredX, now, params),
    y: oneEuro(state.filter?.y ?? null, tip.y, now, params),
  }
  const cursor = {
    x: clamp01((filter.x.value - frame.left) / frame.width),
    y: clamp01((filter.y.value - frame.top) / frame.height),
  }
  return { state: { filter, missed: 0, cursor }, events: [{ kind: 'move', point: cursor }] }
}
