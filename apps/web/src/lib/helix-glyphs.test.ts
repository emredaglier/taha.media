import { describe, expect, it } from 'vitest'

import { cellLadder, ringRadius } from './helix-glyphs'
import { HELIX_TUNING } from './helix-tuning'

const { smallestCell, largestCell, cellSizes } = HELIX_TUNING.glyphs
const { depth } = HELIX_TUNING.meltRing

describe('cellLadder: the glyph grids the melt cross-fades between', () => {
  const ladder = cellLadder(smallestCell, largestCell, cellSizes)

  it('has one size per tuned grid', () => {
    expect(ladder).toHaveLength(cellSizes)
  })

  it('runs from the smallest cell to the largest', () => {
    expect(ladder[0]).toBeCloseTo(smallestCell, 6)
    expect(ladder.at(-1)).toBeCloseTo(largestCell, 6)
  })

  it('grows by the same factor from each size to the next', () => {
    const factors = ladder.slice(1).map((size, index) => size / ladder[index]!)
    for (const factor of factors) {
      expect(factor).toBeGreaterThan(1)
      expect(factor).toBeCloseTo(factors[0]!, 6)
    }
  })

  it('doubles from 2 px to 8 px in three equal steps (a worked example)', () => {
    const sizes = cellLadder(2, 16, 4)
    expect(sizes[1]).toBeCloseTo(4, 6)
    expect(sizes[2]).toBeCloseTo(8, 6)
  })

  it('refuses fewer than two sizes, which leave nothing to cross-fade', () => {
    expect(() => cellLadder(smallestCell, largestCell, 1)).toThrow(RangeError)
  })
})

describe("ringRadius: how far the Showreel's ring of glyphs has grown", () => {
  const REACHES = [0.3, 0.6, 0.9, 1.2, 1.6]

  it('has not reached the centre before the melt starts', () => {
    for (const reach of REACHES) expect(ringRadius(0, reach)).toBeLessThanOrEqual(0)
  })

  it.each(REACHES)(
    'has passed the corners (reach %f) by a whole ring depth as the melt ends',
    (reach) => {
      expect(ringRadius(1, reach)).toBeGreaterThanOrEqual(reach + depth)
    },
  )

  it('only grows as the melt goes on', () => {
    for (const reach of REACHES) {
      let last = -Infinity
      for (let melt = 0; melt <= 1; melt += 0.05) {
        const radius = ringRadius(melt, reach)
        expect(radius).toBeGreaterThan(last)
        last = radius
      }
    }
  })
})
