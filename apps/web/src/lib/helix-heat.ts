import { HELIX_TUNING } from './helix-tuning'

/** A point on the screen, 0 to 1 across (left to right) and up (bottom to top). */
export type ScreenPoint = { x: number; y: number }

/** Where the pointer went since the last frame, and how fast it moved (CSS px per second). */
export type PointerPath = { from: ScreenPoint; to: ScreenPoint; speed: number }

/** Heat laid along the segment `from`-`to`, `strength` at its middle line. */
export type HeatSplat = { from: ScreenPoint; to: ScreenPoint; strength: number }

/**
 * What one frame leaves to the next: the share of a step it still owes, and the pointer's path
 * since the last step, when no step has run since it moved.
 */
export type HeatCarry = { readonly owed: number; readonly pending: PointerPath | null }

/** The trail before its first frame. */
export const HEAT_AT_REST: HeatCarry = { owed: 0, pending: null }

const { stepsPerSecond, maxSteps, push, fullSpeed } = HELIX_TUNING.heat

/** A frame's share of a step this close to a whole step counts as one (floating point). */
const NEARLY = 1e-9

/**
 * The cursor's heat trail for one frame of `dt` seconds (#64): how many fixed steps it runs (the
 * trail runs at `stepsPerSecond` whatever the screen's rate, and at most `maxSteps` in a frame),
 * and the heat the pointer leaves on the first of them (null without a pointer or without a
 * step). A move in a frame that runs no step is kept and joined to the next, so a fast screen
 * leaves the same trail as a slow one.
 */
export function planHeat(
  carry: HeatCarry,
  dt: number,
  cursor: PointerPath | null,
): { steps: number; splat: HeatSplat | null; carry: HeatCarry } {
  const pending =
    carry.pending && cursor
      ? {
          from: carry.pending.from,
          to: cursor.to,
          speed: Math.max(carry.pending.speed, cursor.speed),
        }
      : (cursor ?? carry.pending)
  const owed = Math.min(carry.owed + Math.max(0, dt) * stepsPerSecond, maxSteps)
  const steps = Math.floor(owed + NEARLY)
  if (steps === 0) return { steps, splat: null, carry: { owed, pending } }
  const splat = pending
    ? {
        from: pending.from,
        to: pending.to,
        strength: Math.min(1, pending.speed / fullSpeed) * push,
      }
    : null
  return { steps, splat, carry: { owed: Math.max(0, owed - steps), pending: null } }
}
