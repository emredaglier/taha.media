import {
  INDEX_KNUCKLE,
  INDEX_TIP,
  PINKY_KNUCKLE,
  THUMB_TIP,
  WRIST,
  type HandFrame,
} from './hand-gesture'

/*
 * Synthetic hands for the tests of the gesture reader and the controller (test code only).
 */

/** The palm's length (wrist to index knuckle) of a synthetic hand, in camera-frame heights. */
export const PALM = 0.15

/**
 * A hand whose index fingertip is at (x, y) in the camera's own picture, with the thumb's tip
 * below it at `gap` times the palm's length: the pinch ratio the reader should measure. `palm` is
 * the palm's length in camera-frame heights: a smaller one is a hand further from the camera.
 */
export const pose = (x: number, y: number, gap: number, palm = PALM): HandFrame =>
  Array.from({ length: 21 }, (_, i) => {
    if (i === INDEX_TIP) return { x, y }
    if (i === THUMB_TIP) return { x, y: y + gap * palm }
    if (i === INDEX_KNUCKLE) return { x, y: y + 0.2 }
    if (i === WRIST) return { x, y: y + 0.2 + palm }
    // The knuckles span less than the palm's length, so the length is what `palmSize` reads.
    if (i === PINKY_KNUCKLE) return { x, y: y + 0.2 + palm * 0.6 }
    return { x, y: y + 0.1 }
  })

/** The same frame `count` times. */
export const hold = (frame: HandFrame, count: number): HandFrame[] =>
  Array<HandFrame>(count).fill(frame)

/** The thumb–index gap of a hand resting in a pinch, at the chin say: the fingers touch (#75). */
export const CHIN_GAP = 0.05

/** How a resting hand moves in the camera's picture (#75): not at all, a slow drift, or a sway. */
export type RestMotion = 'still' | 'drift' | 'sway'

/**
 * `count` frames of a hand resting at (x, y) with its fingers `gap` palms apart (a hand at the
 * chin, thumb touching index, for a small gap), one camera frame every `frameMs`: `still`, drifting
 * slowly by `reach` over the whole stream, or swaying ±`reach` (a repeatable zig-zag).
 */
export const resting = (
  motion: RestMotion,
  count: number,
  { x = 0.5, y = 0.5, gap = CHIN_GAP, reach = 0.01 } = {},
): HandFrame[] =>
  Array.from({ length: count }, (_, i) => {
    if (motion === 'drift') return pose(x, y - (reach * i) / Math.max(count - 1, 1), gap)
    if (motion === 'sway')
      return pose(x + reach * Math.sin(i * 0.9), y + reach * Math.cos(i * 0.7), gap)
    return pose(x, y, gap)
  })
