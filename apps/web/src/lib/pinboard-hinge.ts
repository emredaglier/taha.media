/**
 * The Pinboard's sheets hanging from their pins (#146), ported from the prototype
 * (`docs/design/menu3/pinboard.js`: `hinge()`, the draught in `tick()`, the landing swings). Pure step
 * functions on plain state that change it in place (they run every frame): no DOM, no clock; time,
 * pointer and view come in as arguments. Angles are in degrees, positions in view px, `now` in ms.
 */

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
// NaN counts as 0, so one bad input never sticks a value at NaN.
const finite = (value: number) => (Number.isFinite(value) ? value : 0)

/** The longest step, in seconds: a dropped frame or a background tab moves the board by at most this. */
export const MAX_STEP = 0.033
// Clamped here, not by the caller: a gap, zero or bad dt counts as one 60 fps frame (as the prototype's `|| 0.016`).
const stepSeconds = (dt: number) => (dt > 0 ? Math.min(MAX_STEP, dt) : 0.016)

const ANGLE_LIMIT = 42
const LIFT_LOW = -0.15
const LIFT_HIGH = 1.5
const WIND_LIMIT = 4000 // px/s
const GUST_SPEED = 1500 // px/s, both the speed that starts a gust and its front's speed
const GUST_EVERY = 160 // ms
const GUST_LIFE = 1400 // ms
const GUST_MAX = 4

/**
 * One sheet on its pin: angle `a` and angular velocity `w`, lift `l` (tips it off the board) and its
 * velocity `lv`, the rest tilt `rest` (the page's straightens to 0 on close) and its original
 * `rest0`, hover `hv` 0–1 (set by the hover tween), `landed` once its landing swing has played,
 * and its centre (`cx`, `cy`) in view px, where the draught is felt.
 */
export type HingeSheet = {
  a: number
  w: number
  l: number
  lv: number
  rest: number
  rest0: number
  hv: number
  landed: boolean
  cx: number
  cy: number
}

/** A sheet at rest on its pin. */
export const createSheet = (rest: number, cx: number, cy: number): HingeSheet => ({
  a: rest,
  w: 0,
  l: 0,
  lv: 0,
  rest,
  rest0: rest,
  hv: 0,
  landed: false,
  cx,
  cy,
})

/** Back to the closed board's state: at its original tilt, still, not hovered, not landed. */
export function resetSheet(sheet: HingeSheet): void {
  Object.assign(sheet, {
    a: sheet.rest0,
    rest: sheet.rest0,
    w: 0,
    l: 0,
    lv: 0,
    hv: 0,
    landed: false,
  })
}

/** A wave of lifting paper: starts at (`x`, `y`) at `t0`, its front grows at 1500 px/s and hits each sheet once. */
export type Gust = {
  x: number
  y: number
  t0: number
  dir: number
  amp: number
  hit: Set<HingeSheet>
}

/** The pointer as a draught: its smoothed velocity (`vx`, `vy`, px/s), where it was last frame, and the live gusts. */
export type Draught = {
  vx: number
  vy: number
  prevX: number
  prevY: number
  gusts: Gust[]
  lastGust: number
}

type Point = { x: number; y: number }

export const createDraught = (pointer: Point): Draught => ({
  vx: 0,
  vy: 0,
  prevX: finite(pointer.x),
  prevY: finite(pointer.y),
  gusts: [],
  lastGust: -Infinity,
})

/**
 * One frame of the draught: the pointer's velocity, clamped to ±4000 px/s and smoothed (the
 * prototype's lerp 0.35 per 60 fps frame, scaled to `dt` so it is the same at any frame rate), a new
 * gust when it sweeps faster than 1500 px/s across (at most every 160 ms, four live), and gusts older
 * than 1.4 s dropped. `gusting` is false while closed or leaving: no new gusts then.
 */
export function stepDraught(
  draught: Draught,
  pointer: Point,
  dt: number,
  now: number,
  viewWidth: number,
  gusting: boolean,
): void {
  const seconds = stepSeconds(dt)
  const x = finite(pointer.x)
  const y = finite(pointer.y)
  const jumpX = x - draught.prevX
  const follow = 1 - 0.65 ** (seconds * 60)
  draught.vx += (clamp(jumpX / seconds, -WIND_LIMIT, WIND_LIMIT) - draught.vx) * follow
  draught.vy +=
    (clamp((y - draught.prevY) / seconds, -WIND_LIMIT, WIND_LIMIT) - draught.vy) * follow
  draught.prevX = x
  draught.prevY = y
  // The prototype meant to skip a jump of 40% of the view (a touch landing elsewhere) but compared after
  // updating prevX, so never did; this skips it as meant.
  if (
    gusting &&
    Math.abs(draught.vx) > GUST_SPEED &&
    now - draught.lastGust > GUST_EVERY &&
    Math.abs(jumpX) < viewWidth * 0.4
  ) {
    draught.lastGust = now
    draught.gusts.push({
      x,
      y,
      t0: now,
      dir: Math.sign(draught.vx),
      amp: clamp(Math.abs(draught.vx) / 3000, 0.4, 1.2),
      hit: new Set(),
    })
    if (draught.gusts.length > GUST_MAX) draught.gusts.shift()
  }
  while (draught.gusts.length > 0 && !(now - draught.gusts[0]!.t0 < GUST_LIFE))
    draught.gusts.shift()
}

export type HingeInput = {
  pointer: Point
  draught: Draught
  /** The view's width in px, and whether the board is in its portrait column (a wider draught). */
  view: { width: number; portrait: boolean }
  now: number
}

/**
 * One frame of a sheet on its pin: a spring to its rest tilt scaled by `1 - hv` (flat at full
 * hover), stiffer and more damped as `hv` grows; the draught pushes it (wind to the right swings the
 * bottom left, a negative angle) and lifts it with the pointer's speed, both fading with a Gaussian
 * around the pointer (radius 0.2 of the view width, 0.5 in portrait); a gust whose front has
 * reached it kicks it once. The angle stays within ±42°, the lift within −0.15…1.5.
 */
export function stepHinge(sheet: HingeSheet, dt: number, input: HingeInput): void {
  const seconds = stepSeconds(dt)
  const { draught, view, now } = input
  const hv = clamp(finite(sheet.hv), 0, 1)
  const dx = sheet.cx - finite(input.pointer.x)
  const dy = sheet.cy - finite(input.pointer.y)
  const radius = view.width * (view.portrait ? 0.5 : 0.2)
  const falloff = radius > 0 ? Math.exp(-((dx * dx + dy * dy) / (radius * radius))) : 0
  const { vx, vy } = draught
  const aAcc = -vx * 0.12 * falloff + vy * 0.03 * falloff * (dx > 0 ? 1 : -1)
  const lAcc = (Math.hypot(vx, vy) / 1000) * 320 * falloff
  for (const gust of draught.gusts) {
    const distance = Math.hypot(sheet.cx - gust.x, sheet.cy - gust.y)
    if (gust.hit.has(sheet) || !(distance < ((now - gust.t0) / 1000) * GUST_SPEED)) continue
    gust.hit.add(sheet)
    const reach = distance / (view.width * 0.6)
    const strength = gust.amp * Math.exp(-reach * reach)
    sheet.w -= gust.dir * 70 * strength
    sheet.lv += 4.5 * strength
  }
  const a = finite(sheet.a)
  const l = finite(sheet.l)
  const w =
    finite(sheet.w) +
    (-(34 + 260 * hv) * (a - sheet.rest * (1 - hv)) -
      (1.5 + 16 * hv) * finite(sheet.w) +
      aAcc * (1 - hv)) *
      seconds
  const lv =
    finite(sheet.lv) +
    (-(70 + 200 * hv) * l - (5 + 10 * hv) * finite(sheet.lv) + lAcc * (1 - hv)) * seconds
  sheet.w = w
  sheet.a = clamp(a + w * seconds, -ANGLE_LIMIT, ANGLE_LIMIT)
  sheet.lv = lv
  sheet.l = clamp(l + lv * seconds, LIFT_LOW, LIFT_HIGH)
}

/**
 * A sheet's one swing as it is pinned: the first time its entrance `en` passes 0.85 while the board
 * is open, a kick of 22–40 that alternates by its `index` on the board. Returns whether it landed now.
 */
export function landSheet(sheet: HingeSheet, index: number, en: number, open: boolean): boolean {
  if (sheet.landed || !open || !(en > 0.85)) return false
  sheet.landed = true
  sheet.w += (index % 2 ? -1 : 1) * (22 + 18 * ((sheet.cx * 7) % 1))
  return true
}

/** The page sheet's one swing as it lands: −48 the first time its scale-in `t` passes 0.78 while open. */
export function landPage(page: HingeSheet, t: number, open: boolean): boolean {
  if (page.landed || !open || !(t > 0.78)) return false
  page.landed = true
  page.w -= 48
  return true
}
