import { palmSize, type HandFrame } from './hand-gesture'
import { HAND_TUNING } from './hand-tuning'

/*
 * The hints (#58): "Biraz yaklaş" when the hand is too small in the picture, "Daha çok ışık" when
 * tracking is poor in low light. Pure, from what one camera frame showed and its time (ms). Each
 * hint has two lines (hysteresis) and a debounce, so it never flickers. Every number is in
 * `HAND_TUNING.hints`. Nothing of the picture is kept: only the hints' own state.
 */

export type HandHint = 'far' | 'dark'

/** The hints' Turkish text, as decided (#45). */
export const HINT_TEXT: Record<HandHint, string> = {
  far: 'Biraz yaklaş',
  dark: 'Daha çok ışık',
}

/** What one camera frame showed. */
export type HintReading = {
  /** The hand, or null when none was found. */
  hand: HandFrame | null
  /** The tracker's confidence in the hand (0 to 1), or null without one. */
  score: number | null
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
 * One hint's next state. `poor` and `fine` are its two lines: a hint that is off starts counting
 * towards showing on a poor reading, and only a fine one stops the count; a hint that is on starts
 * counting towards clearing on a fine reading, and only a poor one stops it. A reading between the
 * lines neither starts nor stops a count. The change comes once the count reaches its debounce.
 */
const debounce = (flag: Flag, poor: boolean, fine: boolean, now: number): Flag => {
  const { showAfterMs, clearAfterMs } = HAND_TUNING.hints
  const toward = flag.on ? fine : poor
  const against = flag.on ? poor : fine
  const since = against ? null : toward ? (flag.since ?? now) : flag.since
  if (since !== null && now - since >= (flag.on ? clearAfterMs : showAfterMs)) {
    return { on: !flag.on, since: null }
  }
  return { on: flag.on, since }
}

/** One camera frame's reading at `now` (ms): the hints' next state, and those that changed. */
export function readHints(
  state: HintsState,
  { hand, score, luma }: HintReading,
  now: number,
): { state: HintsState; events: HintEvent[] } {
  const { farPalm, nearPalm, lowScore, goodScore, darkLuma, brightLuma } = HAND_TUNING.hints
  // Without a hand there is nothing to say about its distance, so that hint clears.
  const palm = hand ? palmSize(hand) : null
  const next: HintsState = {
    far: debounce(
      state.far,
      palm !== null && palm < farPalm,
      palm === null || palm > nearPalm,
      now,
    ),
    dark: debounce(
      state.dark,
      (score !== null && score < lowScore) || (luma !== null && luma < darkLuma),
      (score === null || score > goodScore) && (luma === null || luma > brightLuma),
      now,
    ),
  }
  const events: HintEvent[] = []
  for (const hint of ['far', 'dark'] as const) {
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
