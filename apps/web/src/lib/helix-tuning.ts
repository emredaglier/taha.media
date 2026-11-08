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
  /**
   * The opening (#54): the page scrolls this far (vh) to zoom the Showreel out into the Helix. The
   * page is one screen plus this tall while the zoom runs.
   */
  zoomScrollVh: 140,
  /** How fast the zoom follows the scroll, per second (time-based easing). */
  zoomRate: 7,
  /** The Helix spins this many cards while it zooms. */
  zoomSpinCards: 2.5,
  /** The Showreel melts away in this many seconds once the zoom has landed. */
  meltSeconds: 1.3,
  /**
   * The melt starts once the page has scrolled this far through the zoom's scroll length (0 to 1)
   * and the eased zoom has got past `meltStartZoom` (0 to 1): then the zoom lands on the front card.
   */
  meltStartScroll: 0.995,
  meltStartZoom: 0.95,
  /** The hero's name, ©, Statement and "Sesli izle" have left by this much of the zoom (0 to 1). */
  heroLeavesBy: 0.35,
  /**
   * The cards appear during the zoom: the first (the Showreel's own) as it begins, the others from
   * `appearFrom` of the zoom, spread over the next `appearSpread` of it in a scattered order, each
   * taking `appearSpan` of the zoom to fade in (all 0 to 1).
   */
  appearFrom: 0.08,
  appearSpread: 0.55,
  appearSpan: 0.35,
  /** The front Work's overlay comes in this far through the melt (0 to 1). */
  frontShowsAt: 0.5,
  /** The front Work's overlay fades in over this long (ms); at once while a Work link has focus. */
  frontFadeMs: 600,
  /** The Helix takes over from the static hero after waiting this long (ms) for the Showreel. */
  handOverMs: 2500,
  /**
   * When the static hero shows the phone variant of the Showreel, which the Helix doesn't use, the
   * static picture fades out over this long (ms) as the Helix takes over, instead of cutting. With
   * the 16:9 loop or a poster the pictures match and there is no fade.
   */
  phoneFadeMs: 350,
  /** How much more than just covering the screen the zoom starts from (1 covers it exactly). */
  coverSpare: 1.02,
  /**
   * The melt's ring, in screen heights: how wide it is (`width`), how far it pushes the picture
   * outwards at its rim (`push`), how bright the rim is (`rim`), how far its edge wobbles
   * (`wobble`), and how far past the Showreel's corners it grows (`reachMargin`).
   */
  meltRing: { width: 0.035, push: 0.035, rim: 0.25, wobble: 0.08, reachMargin: 0.1 },
}
