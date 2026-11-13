import { ROOM_TUNING } from './room-tuning'

/**
 * How the Edit Room answers the visitor's hand (#127), pure like the room model: the pointer
 * turns the view and the chair, the wheel's units. The renderer applies what they say.
 */

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
// NaN counts as 0, so one bad input never sticks a value at NaN.
const finite = (value: number) => (Number.isFinite(value) ? value : 0)

/** How far the view is turned away from the path's own aim, in radians (left, up). */
export type Look = { x: number; y: number }

/**
 * One frame of the pointer turning the view, changing `look` in place (no allocation, it runs every
 * frame): towards where the pointer is (`nx`, `ny`: -1 to 1 across and up), or back to the middle
 * with none (it left, or the device has no hover). Follows with time-based easing, so it has
 * weight and is the same at any frame rate.
 */
export function stepLook(
  look: Look,
  pointer: { nx: number; ny: number } | null,
  seconds: number,
): void {
  const { yaw, pitch, rate } = ROOM_TUNING.look
  const aimX = pointer ? -clamp(finite(pointer.nx), -1, 1) * yaw : 0
  const aimY = pointer ? clamp(finite(pointer.ny), -1, 1) * pitch : 0
  const follow = 1 - Math.exp(-Math.max(0, finite(seconds)) * rate)
  look.x += (aimX - look.x) * follow
  look.y += (aimY - look.y) * follow
}

/** The chair's swivel: its angle and how fast it turns. */
export type ChairSwivel = { yaw: number; speed: number }

/** One frame of the chair, changing it in place: `push` is the pointer's nudge this frame; a spring brings it back. */
export function stepChair(chair: ChairSwivel, push: number, seconds: number): void {
  const { stiffness, damping, maxYaw } = ROOM_TUNING.chair
  const dt = Math.max(0, finite(seconds))
  chair.speed += finite(push) + (-chair.yaw * stiffness - chair.speed * damping) * dt
  chair.yaw = clamp(chair.yaw + chair.speed * dt, -maxYaw, maxYaw)
}

/** The pixels a wheel event moved: `deltaMode` 0 is pixels, 1 lines, 2 pages of `viewportHeight`. */
export function wheelPixels(delta: number, deltaMode: number, viewportHeight: number): number {
  const unit = deltaMode === 1 ? ROOM_TUNING.wheelLinePx : deltaMode === 2 ? viewportHeight : 1
  return finite(delta) * unit
}

const smoothstep = (low: number, high: number, x: number) => {
  const t = clamp((x - low) / (high - low), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Whether a screen `aspect` (width / height) is a phone held upright: the camera takes the phone stops. */
export const isPortrait = (aspect: number): boolean => aspect < ROOM_TUNING.portraitBelow

/** The camera's field of view (degrees) for a screen `aspect`: wider on a tall screen, so the room still fits. */
export function fovFor(aspect: number): number {
  const { base, extra, tallAspect, wideAspect } = ROOM_TUNING.fov
  return base + (1 - smoothstep(tallAspect, wideAspect, finite(aspect))) * extra
}

/**
 * The part of a picture a 16:9 still shows (a cover crop, as CSS `object-fit: cover` with
 * `object-position` at the focal point): `focalPoint` is a percentage across and down, as the CMS stores it.
 */
export function stillCrop(
  width: number,
  height: number,
  focalPoint: { x: number; y: number },
): { x: number; y: number; width: number; height: number } {
  const wide = (width * 9) / 16 >= height // wider than 16:9: cut the sides
  const cropWidth = wide ? (height * 16) / 9 : width
  const cropHeight = wide ? height : (width * 9) / 16
  return {
    x: (clamp(finite(focalPoint.x), 0, 100) / 100) * (width - cropWidth),
    y: (clamp(finite(focalPoint.y), 0, 100) / 100) * (height - cropHeight),
    width: cropWidth,
    height: cropHeight,
  }
}

/** Where `place`'s cell is in the atlas, in UV space (v up): `[u, v, width, height]`. Cell 0 is the top left of the canvas. */
export function atlasRect(place: number): [number, number, number, number] {
  const { columns, rows } = ROOM_TUNING.atlas
  const row = Math.floor(place / columns)
  return [(place % columns) / columns, 1 - (row + 1) / rows, 1 / columns, 1 / rows]
}
