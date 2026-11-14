import { ROOM_TUNING, type Stop } from './room-tuning'

/**
 * The Edit Room's model (#125): pure, no Three.js and no DOM. It decides which Work sits on which
 * place and where the camera is for a scroll position; a thin renderer draws what it says.
 * What runs every frame (`cameraPose`, `scrollBy`, `stepScroll`) allocates nothing.
 */

type Vec3 = [number, number, number]

/** Where the camera stands and what it looks at, in metres. */
export type CameraPose = { position: Vec3; lookAt: Vec3 }

/** Featured Work `i` on place `i`, in the Editor's order: a place with no Work is null (dark); Works past the last place are left out. */
export function placeWorks<T>(works: readonly T[]): (T | null)[] {
  return Array.from({ length: ROOM_TUNING.places }, (_, place) => works[place] ?? null)
}

// NaN counts as 0, so one bad input never sticks the scroll at NaN.
const clamp01 = (value: number) => (value > 0 ? Math.min(1, value) : 0)

/** Cubic through `x1` and `x2` with end slopes `t1` and `t2` (Hermite, in coefficients). */
const hermite = (x1: number, x2: number, t1: number, t2: number, u: number) =>
  x1 + u * (t1 + u * (-3 * x1 + 3 * x2 - 2 * t1 - t2 + u * (2 * x1 - 2 * x2 + t1 + t2)))

// Centripetal: the knot spacing is the square root of the distance.
const gap = (a: Vec3, b: Vec3) => Math.sqrt(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))

/**
 * A point on the centripetal Catmull-Rom spline through `points` at `t` in 0..1, written into
 * `out`: the same curve as Three.js `CatmullRomCurve3(points, false, 'centripetal')`, which the
 * prototype uses.
 */
function splinePoint(points: readonly Vec3[], t: number, out: Vec3): void {
  const last = points.length - 1
  const p = clamp01(t) * last
  const segment = Math.min(Math.floor(p), last - 1)
  const u = p - segment
  const p1 = points[segment]!
  const p2 = points[segment + 1]!
  // The ends reflect their neighbour (p0 = 2 p1 - p2), so the curve leaves the first stop and
  // enters the last straight; a reflected point is as far from its stop as the neighbour is.
  const before = segment > 0 ? points[segment - 1]! : null
  const after = segment + 2 <= last ? points[segment + 2]! : null
  const dt1 = gap(p1, p2) < 1e-4 ? 1 : gap(p1, p2)
  const gap0 = before ? gap(before, p1) : gap(p1, p2)
  const gap2 = after ? gap(p2, after) : gap(p1, p2)
  const dt0 = gap0 < 1e-4 ? dt1 : gap0
  const dt2 = gap2 < 1e-4 ? dt1 : gap2
  for (let i = 0; i < 3; i++) {
    const x1 = p1[i]!
    const x2 = p2[i]!
    const x0 = before ? before[i]! : 2 * x1 - x2
    const x3 = after ? after[i]! : 2 * x2 - x1
    const t1 = ((x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1) * dt1
    const t2 = ((x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2) * dt1
    out[i] = hermite(x1, x2, t1, t2, u)
  }
}

const stopsOf = (phone: boolean): readonly Stop[] =>
  phone ? ROOM_TUNING.phoneStops : ROOM_TUNING.desktopStops

/** The stops' positions and look-at points as plain vectors, made once. */
const pathOf = (stops: readonly Stop[]) => ({
  positions: stops.map((stop): Vec3 => [...stop.position]),
  lookAts: stops.map((stop): Vec3 => [...stop.lookAt]),
})
const PATHS = { desktop: pathOf(stopsOf(false)), phone: pathOf(stopsOf(true)) }

/**
 * The camera pose at `progress` along the path (0 the doorway, 1 the last stop; outside it clamps).
 * The camera lingers at each stop, then moves on, and passes through every stop exactly. It is
 * written into `out` (a new pose when none is given): a frame loop reuses one and allocates nothing.
 */
export function cameraPose(
  progress: number,
  phone: boolean,
  out: CameraPose = { position: [0, 0, 0], lookAt: [0, 0, 0] },
): CameraPose {
  const path = phone ? PATHS.phone : PATHS.desktop
  const turns = (path.positions.length - 1) * Math.PI * 2
  const p = clamp01(progress)
  const along = clamp01(p - (ROOM_TUNING.linger * Math.sin(p * turns)) / turns)
  splinePoint(path.positions, along, out.position)
  splinePoint(path.lookAts, along, out.lookAt)
  return out
}

/** The stop that shows `place`, and where on the path (0 to 1) the camera stands on it. */
export function stopForPlace(place: number, phone: boolean): { index: number; progress: number } {
  if (!Number.isInteger(place) || place < 0 || place >= ROOM_TUNING.places) {
    throw new RangeError(`No such place in the room: ${place}`)
  }
  const index = (phone ? ROOM_TUNING.phonePlaceStops : ROOM_TUNING.desktopPlaceStops)[place]!
  return { index, progress: index / (stopsOf(phone).length - 1) }
}

type Point = { readonly x: number; readonly y: number; readonly z: number }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

/**
 * Which places play their loop (#129): the `ROOM_TUNING.liveLoops` screens nearest `camera` that
 * have a Work, by their centres. Written into `out` (true: plays) without allocating, for the frame loop.
 */
export function livePlaces(
  camera: Point,
  centres: readonly Point[],
  hasWork: readonly boolean[],
  touch: boolean,
  out: boolean[] = [],
): boolean[] {
  out.length = centres.length
  out.fill(false)
  for (let left = ROOM_TUNING.liveLoops[touch ? 'touch' : 'desktop']; left > 0; left--) {
    let nearest = -1
    for (let place = 0; place < centres.length; place++) {
      if (out[place] || !hasWork[place]) continue
      if (nearest < 0 || distance(camera, centres[place]!) < distance(camera, centres[nearest]!))
        nearest = place
    }
    if (nearest < 0) break
    out[nearest] = true
  }
  return out
}

/**
 * The virtual scroll: where the wheel or drag has asked the camera to be, and where it is. 0 to 1
 * along the path; below 0, back to `HOLD_PROGRESS`, the scroll scrubs the opening (#140).
 */
export type RoomScroll = { target: number; progress: number }

/** Where the scroll holds the opening on the Showreel: the opening's scroll length before the path's start. */
export const HOLD_PROGRESS = -ROOM_TUNING.opening.scrollPx / ROOM_TUNING.scrollLengthPx

export const createScroll = (): RoomScroll => ({ target: 0, progress: 0 })

/** The wheel or a vertical drag moved `px` CSS px (positive: further in). Stops at the last stop and at the hold. Changes `scroll` in place. */
export function scrollBy(scroll: RoomScroll, px: number): void {
  const target = scroll.target + (Number.isNaN(px) ? 0 : px) / ROOM_TUNING.scrollLengthPx
  scroll.target = target > HOLD_PROGRESS ? Math.min(1, target) : HOLD_PROGRESS
}

/** Moves `progress` towards `target` for one frame of `seconds`, with time-based easing: it never overshoots. Changes `scroll` in place. */
export function stepScroll(scroll: RoomScroll, seconds: number): void {
  const dt = Math.min(seconds > 0 ? seconds : 0, ROOM_TUNING.maxFrameSeconds)
  const next =
    scroll.progress +
    (scroll.target - scroll.progress) * (1 - Math.exp(-dt * ROOM_TUNING.followRate))
  // Below the path's start (the opening) it moves no faster than the scrub's pace: a flick never
  // jumps the room's light (WCAG 2.3.1).
  const most = (dt * -HOLD_PROGRESS) / ROOM_TUNING.opening.scrubSeconds
  scroll.progress = Math.min(
    scroll.progress < 0 ? scroll.progress + most : Infinity,
    Math.max(Math.min(scroll.progress, 0) - most, next),
  )
}
