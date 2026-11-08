/**
 * Every number the owner may retune in the Helix, in one place (#45, "Tuning object"), at the
 * values approved in the prototype (`docs/design/prototype-home-helix.html`). Code reads them from
 * here and tests derive their inputs from them, so a retune changes only this file.
 */
export const HELIX_TUNING = {
  /** Cards turned per pixel of wheel travel. One notch has to pass `settleThreshold`. */
  wheelScale: 0.0022,
  /** Cards turned per pixel of vertical drag. */
  dragScale: 0.007,
  /** The wheel has stopped once no tick came for this long (ms); then the Helix settles. */
  wheelIdleMs: 110,
  /** How fast the Helix follows the wheel or a drag, per second (time-based easing). */
  followRate: 4.7,
  /** The settle spring comes to rest on a card in about this many seconds. */
  settleSeconds: 0.55,
  /**
   * A move that left the last card by less than this fraction of a card springs back to it;
   * further than this, the Helix settles on the next card in the direction of travel.
   */
  settleThreshold: 0.12,
  /** How far ahead the turning speed carries the settle target (cards per card/s). */
  settleLookahead: 0.08,
  /** An arrow key or a click on a side card turns to a whole card in this long (ms). */
  tweenMs: 1300,
  /** A press that travels less than this (CSS px) before release is a click, not a drag. */
  clickSlopPx: 6,
  /** The Helix repeats the Featured Works in order until it holds at least this many cards. */
  minCards: 10,
  /** Below either value the device is weak and gets the static Home (a value not reported passes). */
  weakDevice: { minMemoryGb: 4, minCores: 4 },
  /** Distance from the middle (0 to 1 of the half-height) where the top and bottom fade begins. */
  sharpBand: 0.25,
  /**
   * The Helix's size: the share of the screen height the front card takes (the prototype had
   * about 0.29). Where that would be too wide (phones), the card fits the width instead.
   */
  frontCardHeight: 0.45,
}
