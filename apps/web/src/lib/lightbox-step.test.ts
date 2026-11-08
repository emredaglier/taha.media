import { describe, expect, it } from 'vitest'

import { stepIndex } from './lightbox-step'

/** Gallery sizes from one item to a dozen: every length wraps differently. */
const counts = Array.from({ length: 12 }, (_, i) => i + 1)
const positions = counts.flatMap((count) =>
  Array.from({ length: count }, (_, index) => ({ count, index })),
)

describe('stepIndex', () => {
  it.each(positions)('stays inside the list in both directions (%o)', ({ index, count }) => {
    for (const step of [1, -1] as const) {
      const next = stepIndex(index, count, step)
      expect(Number.isInteger(next)).toBe(true)
      expect(next).toBeGreaterThanOrEqual(0)
      expect(next).toBeLessThan(count)
    }
  })

  it.each(counts)('wraps next from the last item to the first, of %i', (count) => {
    expect(stepIndex(count - 1, count, 1)).toBe(0)
  })

  it.each(counts)('wraps previous from the first item to the last, of %i', (count) => {
    expect(stepIndex(0, count, -1)).toBe(count - 1)
  })

  it.each(positions)(
    'next then previous is the identity, and so is the reverse (%o)',
    ({ index, count }) => {
      expect(stepIndex(stepIndex(index, count, 1), count, -1)).toBe(index)
      expect(stepIndex(stepIndex(index, count, -1), count, 1)).toBe(index)
    },
  )

  it.each(positions)('moves one place wherever there is room to move (%o)', ({ index, count }) => {
    if (index < count - 1) expect(stepIndex(index, count, 1)).toBe(index + 1)
    if (index > 0) expect(stepIndex(index, count, -1)).toBe(index - 1)
  })

  it.each(counts)('visits every item once in a full turn, either way, of %i', (count) => {
    for (const step of [1, -1] as const) {
      const seen = new Set<number>()
      let index = 0
      for (let turn = 0; turn < count; turn++) {
        seen.add(index)
        index = stepIndex(index, count, step)
      }
      expect(seen.size).toBe(count)
      expect(index).toBe(0)
    }
  })

  it('stays put with one item, and answers 0 for an empty list', () => {
    expect(stepIndex(0, 1, 1)).toBe(0)
    expect(stepIndex(0, 1, -1)).toBe(0)
    expect(stepIndex(0, 0, 1)).toBe(0)
  })
})
