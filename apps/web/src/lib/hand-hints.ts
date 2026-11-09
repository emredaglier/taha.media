import { palmSize, type HandFrame } from './hand-gesture'
import { HAND_TUNING } from './hand-tuning'

/*
 * The hints (#58): "Biraz yaklaş" when the hand is too small in the picture, "Daha çok ışık" when
 * the picture is too dark. Pure, from what one camera frame showed and its time (ms). Each hint
 * has two lines (hysteresis) and a debounce, so it never flickers. Every number is in
 * `HAND_TUNING.hints`. Nothing of the picture is kept: only the hints' own state.
 */

/** Every hint, in the order they are shown. */
export const HINTS = ['far', 'dark'] as const

export type HandHint = (typeof HINTS)[number]

/** The hints' Turkish text, as decided (#45). */
export const HINT_TEXT: Record<HandHint, string> = {
  far: 'Biraz yaklaş',
  dark: 'Daha çok ışık',
}

/** What one camera frame showed. */
export type HintReading = {
  /** The hand, or null when none was found. */
  hand: HandFrame | null
  /** The picture's mean luma (0–255) as last sampled, or null before the first sample. */
  luma: number | null
}

/** A hint's state: whether it shows, and since when the readings have argued for a change. */
type Flag = { on: boolean; since: number | null }

export type HintsState = Record<HandHint, Flag>

export type HintEvent = { kind: 'hint'; hint: HandHint; on: boolean }

export const initialHints: HintsState = {
  far: { on: false, since: null },
  dark: { on: false, since: null },
}

/**
 * One hint's next state. `poor` and `fine` are its two lines: a hint that is off shows once poor
 * readings have held for `showAfterMs`, and one that is on clears once fine readings have held for
 * `clearAfterMs`. Any other reading, between the lines or on the far side, breaks the count, so a
 * reading between the lines never changes a hint (hysteresis).
 */
const debounce = (flag: Flag, poor: boolean, fine: boolean, now: number): Flag => {
  const { showAfterMs, clearAfterMs } = HAND_TUNING.hints
  const toward = flag.on ? fine : poor
  const since = toward ? (flag.since ?? now) : null
  if (since !== null && now - since >= (flag.on ? clearAfterMs : showAfterMs)) {
    return { on: !flag.on, since: null }
  }
  return { on: flag.on, since }
}

/** One camera frame's reading at `now` (ms): the hints' next state, and those that changed. */
export function readHints(
  state: HintsState,
  { hand, luma }: HintReading,
  now: number,
): { state: HintsState; events: HintEvent[] } {
  const { farPalm, nearPalm, darkLuma, brightLuma } = HAND_TUNING.hints
  // Without a hand there is nothing to say about its distance, so that hint clears.
  const palm = hand ? palmSize(hand) : null
  const next: HintsState = {
    far: debounce(
      state.far,
      palm !== null && palm < farPalm,
      palm === null || palm > nearPalm,
      now,
    ),
    // Brightness only (owner, 2026-11-09); before the first sample there is nothing to say.
    dark: debounce(
      state.dark,
      luma !== null && luma < darkLuma,
      luma === null || luma > brightLuma,
      now,
    ),
  }
  const events: HintEvent[] = []
  for (const hint of HINTS) {
    if (next[hint].on !== state[hint].on) events.push({ kind: 'hint', hint, on: next[hint].on })
  }
  return { state: next, events }
}

/**
 * The mean luma (0–255, Rec. 601 weights) of RGBA pixels as `getImageData` gives them; alpha is
 * ignored. The controller reads it from the camera picture shrunk to a few hundred pixels.
 */
export function meanLuma(rgba: Uint8ClampedArray): number {
  const count = Math.floor(rgba.length / 4)
  if (count === 0) return 0
  let sum = 0
  for (let i = 0; i < count * 4; i += 4) {
    sum += 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!
  }
  return sum / count
}
