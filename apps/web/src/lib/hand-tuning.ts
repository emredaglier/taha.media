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
  /**
   * The pinch (#57): the thumb–index gap divided by the palm (wrist to index knuckle), both in
   * camera pixels, so it reads the same near the camera or far from it.
   */
  pinch: {
    /** The first camera frames with a hand measure the visitor's open gap; pinching waits for them. */
    calibrationFrames: 15,
    /**
     * The open gap is this percentile of the calibration's gaps, not their median, so a hand that
     * starts pinched or in a fist for part of it still calibrates on its open frames.
     */
    calibrationPercentile: 0.8,
    /** The fingers close below this share of the open gap. */
    calibrationShare: 1 / 3,
    /** Whatever the calibration reads, the threshold stays within the prototype's slider range. */
    threshold: { min: 0.15, max: 0.6 },
    /** Hysteresis: closed below the threshold, open again only above this many times it. */
    openFactor: 1.5,
    /** A change of the fingers counts only after this many camera frames in a row. */
    confirmFrames: 2,
    /**
     * The grab's anchor: the cursor as it was in the last frame whose gap was within this share of
     * the widest gap of the last `anchorWindowMs`, the moment before the fingers began to close,
     * but never more than `anchorMaxAgeMs` before the first frame of the closing (the frame at that
     * cap otherwise), so a hand that moves while its fingers relax doesn't snap far back.
     */
    anchorSlack: 0.1,
    anchorWindowMs: 400,
    anchorMaxAgeMs: 200,
    /** After letting go, the cursor eases from the pinch point back to the fingertip in this long (ms). */
    releaseEaseMs: 200,
  },
  /**
   * A click is a quick pinch: let go within `maxMs` of closing, and moving less than `maxTravel`
   * of the camera frame's height meanwhile. Any longer or further and the pinch is a grab.
   */
  click: { maxMs: 350, maxTravel: 0.03 },
  /**
   * Grabbing (#57), from the hand's movement in screen heights: the page scrolls `scrollGain`
   * screen heights per screen height the hand moves (the prototype's 5 × 0.6 × 0.76), and on Home
   * the Helix turns `turnCards` cards per screen height (the prototype's 5 × 0.76). On letting go,
   * the page glides on at the speed of the last `glideSampleMs`, slowing with a time constant of
   * `glideSeconds`, until it is under `glideStopPxPerSecond` (about a pixel per display frame).
   * A release slower than `glideFromPxPerSecond` (a third of a screen per second at 800 px tall)
   * doesn't glide at all: only a flick does. Under reduced motion nothing glides.
   */
  grab: {
    scrollGain: 2.28,
    turnCards: 3.8,
    glideSampleMs: 100,
    glideSeconds: 0.3,
    glideStopPxPerSecond: 60,
    glideFromPxPerSecond: 250,
    /**
     * In the Galeri lightbox (#59), a grab moving this many screen widths left or right steps to
     * the next or previous item, once; another as far steps again (`lib/hand-steps.ts`).
     */
    stepWidths: 0.15,
  },
} as const
