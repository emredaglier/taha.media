import { HELIX_TUNING } from './helix-tuning'

/** The glyph mosaic's cell sizes are px at a screen this tall (the prototype's), at any size. */
export const CELL_SCREEN_PX = 900

/** The Showreel's glyph cells grow this much coarser than the cards' (the prototype's). */
export const RING_COARSER = 1.4

/**
 * The glyph mosaic's cell sizes (#68): `count` whole grids from `smallest` to `largest` px, each
 * the last times the same factor, which the melt cross-fades two at a time.
 */
export function cellLadder(smallest: number, largest: number, count: number): number[] {
  if (count < 2) throw new RangeError('The glyph mosaic needs at least two cell sizes')
  const factor = (largest / smallest) ** (1 / (count - 1))
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? largest : smallest * factor ** index,
  )
}

/**
 * How far the Showreel's ring of glyphs has grown from its centre, in screen heights, `melt` (0 to
 * 1) into the Showreel's melt, when its corners are `reach` away: past them by `reachMargin` plus
 * a whole ring `depth` as the melt ends, so the last cells are gone.
 */
export function ringRadius(melt: number, reach: number): number {
  const { depth, reachMargin, headStart } = HELIX_TUNING.meltRing
  return melt * (reach + reachMargin + depth) - headStart
}
