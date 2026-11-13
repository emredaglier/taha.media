import type { CameraPose } from './room-model'
import { ROOM_TUNING } from './room-tuning'

/**
 * Pointing at the Edit Room's screens (#130): pure like the room model, no Three.js and no DOM.
 * Which screen a ray meets, which Work is hot and how bright every screen is, the push-in's
 * timing and end pose, and where the hot Work's tag goes. What runs every frame (`pickScreen`,
 * `stepHeat`, `tagPlace`) allocates nothing.
 */

type Point = { readonly x: number; readonly y: number; readonly z: number }

/** A screen as a rectangle in space: its centre, its right, up and facing directions (unit vectors) and its size in metres. */
export type ScreenPlane = {
  centre: Point
  right: Point
  up: Point
  normal: Point
  width: number
  height: number
}

const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y + a.z * b.z
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
// NaN counts as 0, so one bad input never sticks a value at NaN.
const positive = (value: number) => (value > 0 ? value : 0)

/**
 * The place whose screen the ray (`origin`, unit `dir`) meets first, or -1: the ray is tested
 * against each screen's plane by hand, and counts as on it within `margin` times its size (plus
 * `ROOM_TUNING.pick.slack`). A screen seen from behind, behind the origin, or with no Work is skipped.
 */
export function pickScreen(
  origin: Point,
  dir: Point,
  planes: readonly ScreenPlane[],
  hasWork: readonly boolean[],
  margin: number,
): number {
  let best = -1
  let bestAt = Infinity
  for (let place = 0; place < planes.length; place++) {
    const screen = planes[place]!
    const facing = dot(dir, screen.normal)
    if (!hasWork[place] || facing > -1e-4) continue
    const at =
      ((screen.centre.x - origin.x) * screen.normal.x +
        (screen.centre.y - origin.y) * screen.normal.y +
        (screen.centre.z - origin.z) * screen.normal.z) /
      facing
    if (at < 0.02 || at >= bestAt) continue
    const x = origin.x + dir.x * at - screen.centre.x
    const y = origin.y + dir.y * at - screen.centre.y
    const z = origin.z + dir.z * at - screen.centre.z
    const { slack } = ROOM_TUNING.pick
    if (
      Math.abs(x * screen.right.x + y * screen.right.y + z * screen.right.z) <
        (screen.width / 2) * margin + slack &&
      Math.abs(x * screen.up.x + y * screen.up.y + z * screen.up.z) <
        (screen.height / 2) * margin + slack
    ) {
      best = place
      bestAt = at
    }
  }
  return best
}

/** Which Work is hot (-1 none), for how long it has been, and each screen's brightness and glow growth (0 to 1). */
export type RoomHeat = { hot: number; held: number; bright: number[]; grow: number[] }

/** Every screen at its rest brightness, a place with no Work dark, nothing hot. */
export const createHeat = (hasWork: readonly boolean[]): RoomHeat => ({
  hot: -1,
  held: ROOM_TUNING.hot.holdSeconds,
  bright: hasWork.map((has, place) => (has ? ROOM_TUNING.screens[place]!.base : 0)),
  grow: hasWork.map(() => 0),
})

/**
 * One frame of `seconds`, changing `heat` in place: `wanted` is the Work the pointer is on (-1
 * none). The hot Work changes at most once per `ROOM_TUNING.hot.holdSeconds`, so a pointer
 * sweeping across screens can't make them flash (WCAG 2.3.1: 3 flashes a second at most; even a
 * screen that goes up and down on every change stays at 2 or 3). Brightness follows with
 * time-based easing: the hot screen goes past full, the others to about half, none hot is rest.
 */
export function stepHeat(
  heat: RoomHeat,
  wanted: number,
  hasWork: readonly boolean[],
  seconds: number,
): void {
  const dt = positive(seconds)
  const { holdSeconds, bright, others, rate } = ROOM_TUNING.hot
  heat.held += dt
  if (wanted !== heat.hot && heat.held >= holdSeconds) {
    heat.hot = wanted
    heat.held = 0
  }
  const follow = 1 - Math.exp(-dt * rate)
  for (let place = 0; place < heat.bright.length; place++) {
    const rest = ROOM_TUNING.screens[place]!.base
    const target = !hasWork[place]
      ? 0
      : heat.hot < 0
        ? rest
        : heat.hot === place
          ? bright
          : rest * others
    heat.bright[place]! += (target - heat.bright[place]!) * follow
    heat.grow[place]! += ((heat.hot === place ? 1 : 0) - heat.grow[place]!) * follow
  }
}

/** How far the camera is from the path pose to the screen (0 to 1) `seconds` into the push-in: slow, quick, slow (quartic in-out). It ends at 1 on time and stays. */
export function pushBlend(seconds: number): number {
  const p = clamp(positive(seconds) / ROOM_TUNING.push.seconds, 0, 1)
  return p < 0.5 ? 8 * p ** 4 : 1 - 8 * (1 - p) ** 4
}

/**
 * Where the push-in ends: straight in front of `screen` on its normal, so near that the screen's
 * limiting side fills the view (`ROOM_TUNING.push.fill` of it, for a camera of `fov` degrees at `aspect`), looking at its centre.
 */
export function pushPose(screen: ScreenPlane, fov: number, aspect: number): CameraPose {
  const distance =
    (ROOM_TUNING.push.fill * Math.min(screen.width / aspect, screen.height)) /
    (2 * Math.tan((fov * Math.PI) / 360))
  const { centre, normal } = screen
  return {
    position: [
      centre.x + normal.x * distance,
      centre.y + normal.y * distance,
      centre.z + normal.z * distance,
    ],
    lookAt: [centre.x, centre.y, centre.z],
  }
}

/**
 * Where the tag of the hot screen goes (its top left, px from the view's top left), written into
 * `out`: `box` is the screen's box on the view, `tag` the tag's size. Beside the screen on its
 * right, else its left (not on a `phone`), else under it, else over it; kept inside the view
 * under the header.
 */
export function tagPlace(
  box: { x0: number; x1: number; y0: number; y1: number },
  tag: { width: number; height: number },
  view: { width: number; height: number },
  phone: boolean,
  out: { left: number; top: number },
): void {
  const { gap, edge, top, phoneTop, below } = ROOM_TUNING.tag
  const topLimit = phone ? phoneTop : top
  let left: number
  let at: number
  if (!phone && box.x1 + gap + tag.width <= view.width - edge) {
    left = box.x1 + gap
    at = (box.y0 + box.y1) / 2 - tag.height / 2
  } else if (!phone && box.x0 - gap - tag.width >= edge) {
    left = box.x0 - gap - tag.width
    at = (box.y0 + box.y1) / 2 - tag.height / 2
  } else {
    left = (box.x0 + box.x1) / 2 - tag.width / 2
    at =
      box.y1 + below > view.height - edge - tag.height
        ? box.y0 - below - tag.height
        : box.y1 + below
  }
  out.left = clamp(left, edge, Math.max(edge, view.width - edge - tag.width))
  out.top = clamp(at, topLimit, Math.max(topLimit, view.height - edge - tag.height))
}
