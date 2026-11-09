// The shader check's verdict (`pnpm check:shaders`), as pure functions: what the pixels of a frame
// say, and which observations fail the run. The browser side (entry.ts) only collects them.

/** What a frame's RGBA bytes say about the drawing. */
export type PixelStats = {
  total: number
  /** Pixels with any coverage (alpha above 0). */
  opaque: number
  /** Pixels with a colour channel above their alpha: not valid premultiplied colour. */
  invalidPremultiplied: number
  maxAlpha: number
}

/** The canvas is premultiplied, so a channel can't exceed its alpha, give or take rounding. */
const ROUNDING = 1

export function pixelStats(rgba: ArrayLike<number>): PixelStats {
  const stats: PixelStats = {
    total: rgba.length / 4,
    opaque: 0,
    invalidPremultiplied: 0,
    maxAlpha: 0,
  }
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3]!
    if (alpha > 0) stats.opaque++
    if (
      rgba[i]! > alpha + ROUNDING ||
      rgba[i + 1]! > alpha + ROUNDING ||
      rgba[i + 2]! > alpha + ROUNDING
    )
      stats.invalidPremultiplied++
    stats.maxAlpha = Math.max(stats.maxAlpha, alpha)
  }
  return stats
}

/** What the run saw: `gl.getError()` after each drawn sequence, and the pixels of two frames. */
export type Observation = {
  glErrors: { frames: number; empty: number }
  /** The frame with cards (and a Showreel melt before it). */
  cards: PixelStats
  /** The frame after an empty scene: no cards, no Showreel, the cursor moving. */
  empty: PixelStats
}

const NO_ERROR = 0

/** The reasons the run fails, none if it passes. */
export function judge({ glErrors, cards, empty }: Observation): string[] {
  const failures: string[] = []
  const hex = (error: number) => `0x${error.toString(16)}`
  if (glErrors.frames !== NO_ERROR)
    failures.push(`gl.getError() is ${hex(glErrors.frames)} after drawing the frames`)
  if (glErrors.empty !== NO_ERROR)
    failures.push(`gl.getError() is ${hex(glErrors.empty)} after drawing the empty scene`)
  if (cards.opaque === 0) failures.push('the card frame has no opaque pixel: nothing was drawn')
  if (cards.invalidPremultiplied > 0)
    failures.push(
      `invalid premultiplied output: ${cards.invalidPremultiplied} of ${cards.total} pixels have a colour channel above their alpha`,
    )
  if (empty.maxAlpha > 0)
    failures.push(`the empty scene is not clear: alpha ${empty.maxAlpha} at its highest`)
  return failures
}

/** What the page tells the driver: the observation and a screenshot of each frame, or the error. */
export type Report =
  { observation: Observation; shots: { cards: string; empty: string } } | { error: string }

/** The one line a passing run prints. */
export function summary({ cards, empty }: Observation): string {
  return `check:shaders ok: every program compiles and links, no GL error, ${cards.opaque} of ${cards.total} card pixels drawn (valid premultiplied), the empty scene stays clear (alpha ${empty.maxAlpha})`
}
