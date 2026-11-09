import { INDEX_KNUCKLE, INDEX_TIP, THUMB_TIP, WRIST, type HandFrame } from './hand-gesture'

/*
 * Synthetic hands for the tests of the gesture reader and the controller (test code only).
 */

/** The palm's length (wrist to index knuckle) of a synthetic hand, in camera-frame heights. */
export const PALM = 0.15

/**
 * A hand whose index fingertip is at (x, y) in the camera's own picture, with the thumb's tip
 * below it at `gap` times the palm's length: the pinch ratio the reader should measure.
 */
export const pose = (x: number, y: number, gap: number): HandFrame =>
  Array.from({ length: 21 }, (_, i) => {
    if (i === INDEX_TIP) return { x, y }
    if (i === THUMB_TIP) return { x, y: y + gap * PALM }
    if (i === INDEX_KNUCKLE) return { x, y: y + 0.2 }
    if (i === WRIST) return { x, y: y + 0.2 + PALM }
    return { x, y: y + 0.1 }
  })

/** The same frame `count` times. */
export const hold = (frame: HandFrame, count: number): HandFrame[] =>
  Array<HandFrame>(count).fill(frame)
