/**
 * Every number the owner may retune in the Edit Room's model, in one place (#125), at the values
 * of the prototype (`docs/design/home2/editroom.js`). Code reads them from here and tests derive
 * their inputs from them, so a retune changes only this file. Metres, `[x, y, z]`.
 */
type Vec3 = readonly [number, number, number]
export type Stop = { readonly position: Vec3; readonly lookAt: Vec3 }

export const ROOM_TUNING = {
  /** Places in the room: 0-2 monitors (1 is the middle one), 3 laptop, 4 tablet, 5 phone, 6-7 framed prints. */
  places: 8,
  /** How many screens play their loop at once, the ones nearest the camera; the rest hold a frame or their still. */
  liveLoops: { desktop: 4, touch: 3 },
  /** Wheel or drag travel (CSS px) that carries the camera along the whole path. */
  scrollLengthPx: 3200,
  /** How fast the camera follows the virtual scroll, per second (time-based easing). */
  followRate: 4.5,
  /** The longest frame the follow counts (s), so a stalled tab doesn't jump. */
  maxFrameSeconds: 0.05,
  /** How much the camera lingers at each stop (0 none, 1 stands still on it). */
  linger: 0.55,
  /** Desktop: 6 stops. */
  desktopStops: [
    { position: [0.1, 1.62, 2.2], lookAt: [0, 1.15, -1.8] }, // doorway: the whole room
    { position: [0.05, 1.42, 0.15], lookAt: [0, 1.05, -1.75] }, // in over the chair
    { position: [-0.62, 1.2, -0.75], lookAt: [-0.45, 1.04, -1.75] }, // along the monitors: left
    { position: [0.62, 1.2, -0.75], lookAt: [0.45, 1.04, -1.75] }, // right
    { position: [0.05, 1.5, -0.6], lookAt: [0.05, 0.76, -1.4] }, // down to the tablet and phone
    { position: [-0.2, 1.5, -0.1], lookAt: [1.5, 1.4, -0.55] }, // up to the prints
  ] as readonly Stop[],
  /** Phone: 9 closer stops, one print at a time (the prototype's own). */
  phoneStops: [
    { position: [0, 1.7, 2.3], lookAt: [0, 1.15, -1.8] },
    { position: [0, 1.35, 0.1], lookAt: [0, 1.05, -1.75] },
    { position: [0, 1.2, -0.9], lookAt: [0, 1.05, -1.78] },
    { position: [-0.6, 1.2, -0.95], lookAt: [-0.5, 1.04, -1.75] },
    { position: [0.6, 1.2, -0.95], lookAt: [0.5, 1.04, -1.75] },
    { position: [-0.58, 1.25, -1.05], lookAt: [-0.6, 0.76, -1.4] },
    { position: [0.64, 1.2, -1.0], lookAt: [0.66, 0.76, -1.33] },
    { position: [0.4, 1.5, -1.0], lookAt: [1.5, 1.45, -1.0] }, // print 6
    { position: [0.4, 1.5, -0.1], lookAt: [1.5, 1.45, -0.1] }, // print 7
  ] as readonly Stop[],
  /**
   * The stop that shows each place (index into the stops above). The prototype has no such table:
   * these are picked from where each stop looks. The laptop (x 1.27, z -1.55) takes the stop with
   * it nearest the look axis, the doorway aside (35 degrees off on desktop stop 5, 36 on phone
   * stop 6). Check them by eye when tuning.
   */
  desktopPlaceStops: [2, 1, 3, 5, 4, 4, 5, 5] as readonly number[],
  phonePlaceStops: [3, 2, 4, 6, 5, 6, 7, 8] as readonly number[],
  /** Lens: the field of view (degrees) widens from `base` on a wide screen to `base + extra` on a tall one. */
  fov: { base: 58, extra: 17, tallAspect: 0.6, wideAspect: 1.3 },
  /** Below this width / height the screen is a phone held upright and the camera takes the phone stops. */
  portraitBelow: 0.9,
  /** A wheel in line mode counts this many px a line (page mode counts the viewport's height). */
  wheelLinePx: 16,
  /** The pointer turns the view: at most `yaw` and `pitch` (radians, about 10 and 6 degrees), following at `rate` per second. */
  look: { yaw: 0.17, pitch: 0.1, rate: 2.6 },
  /** The chair swivels on a spring as the pointer passes (angles in radians). */
  chair: { stiffness: 14, damping: 3.2, maxYaw: 0.55, push: 0.006, maxMovePx: 40, reach: 0.16 },
  /**
   * The desk lamp: its head aims `pull` of the way back to rest from the pointer (0 follows it, 1
   * never moves) and follows at `rate` per second; `light` and `spot` are the strengths of its two lights.
   */
  lamp: { pull: 0.72, rate: 3, light: 3.2, spot: 3.4 },
  /** The still of a place is painted into one atlas of `columns` by `rows` cells, each `cellWidth` by `cellHeight` px (16:9). */
  atlas: { columns: 4, rows: 2, cellWidth: 512, cellHeight: 288 },
  /** How long the room waits for the stills (ms) before it draws without the ones still loading. */
  stillsWaitMs: 3000,
  /** Device pixel ratio cap: 2, and 1.5 on touch. */
  pixelRatio: { max: 2, touchMax: 1.5 },
  /** The curved glass in front of the room (#128): the CRT bend (0 none) and how much of the bright parts' glow is added back. The prototype's values. */
  glass: { bend: 0.2, glow: 0.7 },
  /**
   * The Statement's sheet, taped above the monitors: its size in metres and where its centre is on
   * the back wall, its canvas in px, and the largest and smallest type size (px) the Statement is
   * set in to fit it (line height as a share of the size, text width as a share of the canvas).
   */
  sheet: {
    width: 1.9,
    height: 0.78,
    centre: [0, 2.0, -1.994] as readonly [number, number, number],
    canvas: [2048, 840] as readonly [number, number],
    fontMax: 300,
    fontMin: 60,
    lineHeight: 0.95,
    textWidth: 0.88,
  },
  /**
   * The eight places' screens: width in metres (16:9), brightness at rest, the light each throws
   * on the room (`light`, with `power` the tightness of its beam).
   */
  screens: [
    { width: 0.56, base: 0.88, light: 1.5, power: 1.6 },
    { width: 0.56, base: 0.88, light: 1.5, power: 1.6 },
    { width: 0.56, base: 0.88, light: 1.5, power: 1.6 },
    { width: 0.3, base: 0.82, light: 1.2, power: 1.4 },
    { width: 0.248, base: 0.82, light: 0.6, power: 1 },
    { width: 0.142, base: 0.8, light: 0.5, power: 1 },
    { width: 0.64, base: 0.66, light: 0, power: 1 },
    { width: 0.64, base: 0.66, light: 0, power: 1 },
  ] as readonly { width: number; base: number; light: number; power: number }[],
}
