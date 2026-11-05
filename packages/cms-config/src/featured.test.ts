import { describe, expect, it } from 'vitest'

import { featuredCountWarning } from './featured'

describe('the featured count warning', () => {
  it.each([0, 1, 3, 9, 20])('warns for %i featured Works', (count) => {
    expect(featuredCountWarning(count)).toMatch(/4/)
    expect(featuredCountWarning(count)).toMatch(/8/)
  })

  it.each([4, 5, 8])('is silent for %i featured Works', (count) => {
    expect(featuredCountWarning(count)).toBeNull()
  })
})
