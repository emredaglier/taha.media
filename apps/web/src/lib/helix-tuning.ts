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
  /**
   * The sharp middle band (#55): within this distance of the middle of the screen (0 to 1 of the
   * half-height) nothing melts. Beyond it the top and bottom melt away, and only the cards that
   * reach into it play their Preview loops (0: only the card in the middle).
   */
  sharpBand: 0.25,
  /**
   * The glyph mosaic (#68), the material that melts the Helix: the picture turns into a grid of
   * letters from Taha's serif, picked by each cell's brightness, and the cells shrink away. How
   * large the coarsest cells get (`largestCell`, in px at a 900 px tall screen, so the look is the
   * same at any size; the cells grow to it from 2 px as it melts), how many glyphs the brightness
   * picks from (`glyphLevels`, 2 to 8), how far out of step the cells vanish (`stagger`, 0
   * together to 1), and how far the cursor's heat trail shrinks the grid back to picture where it
   * passes (`cursorShrink`: it fades the glyphs back into the picture and never changes the cell
   * size, so the grid doesn't tear).
   */
  glyphs: { largestCell: 14, glyphLevels: 6, stagger: 0.6, cursorShrink: 1 },
  /**
   * The cursor's heat trail the glyph mosaic reads (#64): the moving cursor (on phones, the finger)
   * leaves heat along its path, which spreads and fades. How wide the path is (`radius`, in screen
   * heights), how much heat is left after each of the `stepsPerSecond` steps (`decay`), and how
   * much heat a move adds (`push`, reached at `fullSpeed` CSS px per second, less when slower).
   * The rate is the prototype's on a 120 Hz screen (one step a frame, #67): the trail fades in about
   * 0.16 s and follows the cursor without trailing. A frame runs at most `maxSteps` steps: enough
   * for a 24 fps frame (5 steps) whole, but a stalled tab doesn't run the trail on for seconds.
   */
  heat: {
    radius: 0.05,
    decay: 0.965,
    stepsPerSecond: 120,
    push: 0.6,
    fullSpeed: 1800,
    maxSteps: 8,
  },
  /** How far the cards deep in the Helix melt (0 not at all, 1 fully at the far end). */
  farCards: 0.7,
  /** How far the cards not hovered melt while the pointer rests on a card (0 to 1). */
  notHovered: 0.55,
  /**
   * Hovering a card: the pointer counts as resting once it moves slower than `restSpeed` (CSS
   * px per second; its measured speed falls away at `speedFade` per second once it stops); a card
   * then comes into focus at `inRate` and leaves it at `outRate` (per second, time-based easing).
   */
  pointer: { restSpeed: 480, speedFade: 13.4, inRate: 6, outRate: 4.4 },
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
   * The Showreel's melt, in screen heights: a ring of glyphs grows from its centre; inside it the
   * Showreel turns to coarse glyphs that shrink away over `depth`; and it grows this far past the
   * Showreel's corners (`reachMargin`), so the last cells are gone as the melt ends.
   */
  meltRing: { depth: 0.14, reachMargin: 0.1 },
}
