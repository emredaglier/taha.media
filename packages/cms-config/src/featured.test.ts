import { describe, expect, it } from 'vitest'

import { featuredCountWarning } from './featured'

describe('the featured count warning', () => {
  it.each([0, 1, 7, 9, 20])('warns for %i featured Works, naming 8 and the count', (count) => {
    const warning = featuredCountWarning(count)
    expect(warning).toMatch(/\b8\b/)
    expect(warning).toContain(`şu an ${count} var`)
  })

  it('is silent for exactly 8 featured Works', () => {
    expect(featuredCountWarning(8)).toBeNull()
  })
})
