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

/** What a frame of the Edit Room says, as it leaves the glass pass: its canvas is opaque, so the question is whether it drew anything but black (a glass that did not compile leaves it black). */
export type RoomStats = {
  total: number
  /** Pixels with any colour channel above 0. */
  lit: number
}

export function roomStats(rgba: ArrayLike<number>): RoomStats {
  const stats: RoomStats = { total: rgba.length / 4, lit: 0 }
  for (let i = 0; i < rgba.length; i += 4)
    if (rgba[i]! > 0 || rgba[i + 1]! > 0 || rgba[i + 2]! > 0) stats.lit++
  return stats
}

/** What the run saw: `gl.getError()` after each drawn sequence, and the pixels of three frames. */
export type Observation = {
  glErrors: { frames: number; empty: number; room: number }
  /** The frame with cards (and a Showreel melt before it). */
  cards: PixelStats
  /** The frame after an empty scene: no cards, no Showreel, the cursor moving. */
  empty: PixelStats
  /** The Edit Room, at rest, from the doorway. */
  room: RoomStats
}

const NO_ERROR = 0

/**
 * The least share of the card frame's pixels that must have coverage. The real run draws about 28%
 * at 1280x800, so 5% fails a drawing that is nearly gone (cards pushed off screen, a pass leaving a
 * sliver) without breaking when the cards are reshaped or the scene resized a little.
 */
export const MIN_CARD_COVERAGE = 0.05

/** The reasons the run fails, none if it passes. */
/**
 * The least share of the room frame's pixels that must be lit (any colour). A room whose shader
 * did not compile draws nothing and stays black; the real doorway view lights the walls and floor
 * and the screens, far above this.
 */
export const MIN_ROOM_LIT = 0.05

export function judge({ glErrors, cards, empty, room }: Observation): string[] {
  const failures: string[] = []
  const percent = (share: number) => `${(share * 100).toFixed(1)}%`
  const hex = (error: number) => `0x${error.toString(16)}`
  if (glErrors.frames !== NO_ERROR)
    failures.push(`gl.getError() is ${hex(glErrors.frames)} after drawing the frames`)
  if (glErrors.empty !== NO_ERROR)
    failures.push(`gl.getError() is ${hex(glErrors.empty)} after drawing the empty scene`)
  const coverage = cards.total === 0 ? 0 : cards.opaque / cards.total
  if (coverage < MIN_CARD_COVERAGE)
    failures.push(
      `the card frame covers ${percent(coverage)} of its pixels (${cards.opaque} of ${cards.total}), at least ${percent(MIN_CARD_COVERAGE)} expected: the cards were barely drawn`,
    )
  if (glErrors.room !== NO_ERROR)
    failures.push(`gl.getError() is ${hex(glErrors.room)} after drawing the Edit Room`)
  const roomLit = room.total === 0 ? 0 : room.lit / room.total
  if (roomLit < MIN_ROOM_LIT)
    failures.push(
      `the Edit Room frame has ${percent(roomLit)} of its pixels lit (${room.lit} of ${room.total}), at least ${percent(MIN_ROOM_LIT)} expected: the room was barely drawn`,
    )
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
  | { observation: Observation; shots: { cards: string; empty: string; room: string } }
  | { error: string }

/** The one line a passing run prints. */
export function summary({ cards, empty, room }: Observation): string {
  return `check:shaders ok: every program compiles and links, no GL error, ${cards.opaque} of ${cards.total} card pixels drawn (valid premultiplied), the empty scene stays clear (alpha ${empty.maxAlpha}), ${room.lit} of ${room.total} Edit Room pixels lit`
}
