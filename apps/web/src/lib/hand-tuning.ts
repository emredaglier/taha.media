/**
 * Every number the owner may retune in Hand control (#45, "Tuning object"), at the values tested
 * in the prototype (`docs/design/prototype-home-helix.html`, "Camera finger steering"). Code reads
 * them from here and tests derive their inputs from them, so a retune changes only this file. The
 * weak-device test is the Helix's (`HELIX_TUNING.weakDevice`, through `isWeakDevice`).
 */
export const HAND_TUNING = {
  /**
   * The one-euro filter that steadies the fingertip (Casiez et al. 2012), in camera-frame units
   * (0 to 1) and seconds: `minCutoff` (Hz) smooths a still hand, `beta` opens the cutoff as the
   * hand speeds up so a move doesn't lag, and `dCutoff` (Hz) smooths the speed it reads.
   */
  filter: { minCutoff: 1.2, beta: 0.02, dCutoff: 1 },
  /**
   * The middle of the (mirrored) camera frame that maps onto the whole screen, 0 to 1 of the
   * frame: a hand needs to move only across this box to reach every edge, so movements stay small
   * and the elbow can rest. Outside it, the cursor stays on the nearest edge.
   */
  frame: { left: 0.15, width: 0.7, top: 0.12, height: 0.76 },
  /** Tracking is lost after this many camera frames in a row without a hand (prototype: > 4). */
  lostAfterFrames: 5,
  /** Hand control turns off when the tracker fails on this many camera frames in a row (~1 s). */
  maxFailedFrames: 30,
  /** The camera picture asked for, in px: enough for landmarks, cheap to track. */
  camera: { width: 640, height: 480 },
  /** A Turkish status note (refused, cancelled, turned off) clears after this long (ms). */
  noticeMs: 5000,
} as const
