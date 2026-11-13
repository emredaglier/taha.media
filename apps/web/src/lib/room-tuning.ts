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
}
