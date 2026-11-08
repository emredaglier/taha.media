import { describe, expect, it } from 'vitest'

import { featuredCountWarning } from './featured'

describe('the featured count warning', () => {
  it.each([0, 1, 5, 13, 20])('warns for %i featured Works, naming 6, 12 and the count', (count) => {
    const warning = featuredCountWarning(count)
    expect(warning).toMatch(/\b6\b/)
    expect(warning).toMatch(/\b12\b/)
    expect(warning).toContain(`şu an ${count} var`)
  })

  it.each([6, 8, 9, 12])('is silent for %i featured Works', (count) => {
    expect(featuredCountWarning(count)).toBeNull()
  })
})
