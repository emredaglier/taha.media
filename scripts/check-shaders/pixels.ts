// The shader check's verdict (`pnpm check:shaders`), as pure functions: what the pixels of a frame
// say, and which observations fail the run. The browser side (entry.ts) only collects them.

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

/** What the run saw: `gl.getError()` after the drawn sequence, and the pixels of the frame. */
export type Observation = {
  glError: number
  /** The Edit Room, at rest, from the doorway. */
  room: RoomStats
}

const NO_ERROR = 0

/**
 * The least share of the room frame's pixels that must be lit (any colour). A room whose shader
 * did not compile draws nothing and stays black; the real doorway view lights the walls and floor
 * and the screens, far above this.
 */
export const MIN_ROOM_LIT = 0.05

/** The reasons the run fails, none if it passes. */
export function judge({ glError, room }: Observation): string[] {
  const failures: string[] = []
  const percent = (share: number) => `${(share * 100).toFixed(1)}%`
  if (glError !== NO_ERROR)
    failures.push(`gl.getError() is 0x${glError.toString(16)} after drawing the Edit Room`)
  const roomLit = room.total === 0 ? 0 : room.lit / room.total
  if (roomLit < MIN_ROOM_LIT)
    failures.push(
      `the Edit Room frame has ${percent(roomLit)} of its pixels lit (${room.lit} of ${room.total}), at least ${percent(MIN_ROOM_LIT)} expected: the room was barely drawn`,
    )
  return failures
}

/** What the page tells the driver: the observation and a screenshot of the frame, or the error. */
export type Report = { observation: Observation; shots: { room: string } } | { error: string }

/** The one line a passing run prints. */
export function summary({ room }: Observation): string {
  return `check:shaders ok: every program compiles and links, no GL error, ${room.lit} of ${room.total} Edit Room pixels lit`
}
