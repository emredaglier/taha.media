import { ROOM_TUNING, type Stop } from './room-tuning'

/**
 * The Edit Room's model (#125): pure, no Three.js and no DOM. It decides which Work sits on which
 * place and where the camera is for a scroll position; a thin renderer draws what it says.
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

/**
 * A point on the centripetal Catmull-Rom spline through `points` at `t` in 0..1: the same curve
 * as Three.js `CatmullRomCurve3(points, false, 'centripetal')`, which the prototype uses.
 */
function splinePoint(points: readonly Vec3[], t: number): Vec3 {
  const last = points.length - 1
  const p = clamp01(t) * last
  const segment = Math.min(Math.floor(p), last - 1)
  const u = p - segment
  const p1 = points[segment]!
  const p2 = points[segment + 1]!
  // The ends reflect their neighbour, so the curve leaves the first stop and enters the last straight.
  const p0 = segment > 0 ? points[segment - 1]! : (p1.map((v, i) => 2 * v - p2[i]!) as Vec3)
  const p3 = segment + 2 <= last ? points[segment + 2]! : (p2.map((v, i) => 2 * v - p1[i]!) as Vec3)
  const gap = (a: Vec3, b: Vec3) => Math.sqrt(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))
  const dt1 = gap(p1, p2) < 1e-4 ? 1 : gap(p1, p2)
  const dt0 = gap(p0, p1) < 1e-4 ? dt1 : gap(p0, p1)
  const dt2 = gap(p2, p3) < 1e-4 ? dt1 : gap(p2, p3)
  return p1.map((x1, i) => {
    const x0 = p0[i]!
    const x2 = p2[i]!
    const x3 = p3[i]!
    const t1 = ((x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1) * dt1
    const t2 = ((x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2) * dt1
    return hermite(x1, x2, t1, t2, u)
  }) as Vec3
}

const stopsOf = (phone: boolean): readonly Stop[] =>
  phone ? ROOM_TUNING.phoneStops : ROOM_TUNING.desktopStops

/**
 * The camera pose at `progress` along the path (0 the doorway, 1 the last stop; outside it clamps).
 * The camera lingers at each stop, then moves on, and passes through every stop exactly.
 */
export function cameraPose(progress: number, phone: boolean): CameraPose {
  const stops = stopsOf(phone)
  const turns = (stops.length - 1) * Math.PI * 2
  const p = clamp01(progress)
  const along = clamp01(p - (ROOM_TUNING.linger * Math.sin(p * turns)) / turns)
  return {
    position: splinePoint(
      stops.map((stop) => [...stop.position]),
      along,
    ),
    lookAt: splinePoint(
      stops.map((stop) => [...stop.lookAt]),
      along,
    ),
  }
}

/** The stop that shows `place`, and where on the path (0 to 1) the camera stands on it. */
export function stopForPlace(place: number, phone: boolean): { index: number; progress: number } {
  if (!Number.isInteger(place) || place < 0 || place >= ROOM_TUNING.places) {
    throw new RangeError(`No such place in the room: ${place}`)
  }
  const index = (phone ? ROOM_TUNING.phonePlaceStops : ROOM_TUNING.desktopPlaceStops)[place]!
  return { index, progress: index / (stopsOf(phone).length - 1) }
}

/** The virtual scroll: where the wheel or drag has asked the camera to be, and where it is. Both 0 to 1 along the path. */
export type RoomScroll = { target: number; progress: number }

export const createScroll = (): RoomScroll => ({ target: 0, progress: 0 })

/** The wheel or a vertical drag moved `px` CSS px (positive: further in). Stops at both ends. */
export const scrollBy = (scroll: RoomScroll, px: number): RoomScroll => ({
  ...scroll,
  target: clamp01(scroll.target + (Number.isNaN(px) ? 0 : px) / ROOM_TUNING.scrollLengthPx),
})

/** Moves `progress` towards `target` for one frame of `seconds`, with time-based easing: it never overshoots. */
export function stepScroll(scroll: RoomScroll, seconds: number): RoomScroll {
  const dt = Math.min(seconds > 0 ? seconds : 0, ROOM_TUNING.maxFrameSeconds)
  const progress =
    scroll.progress +
    (scroll.target - scroll.progress) * (1 - Math.exp(-dt * ROOM_TUNING.followRate))
  return { ...scroll, progress }
}
