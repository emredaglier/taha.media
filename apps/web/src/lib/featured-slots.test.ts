import { describe, expect, it } from 'vitest'

import { featuredGroups, SLOTS } from './featured-slots'

/** Lists of 0 to 13 items: past four groups, so the cycle repeats several times. */
const lists = Array.from({ length: 14 }, (_, length) => Array.from({ length }, (_, i) => `w${i}`))

describe('featuredGroups', () => {
  it.each(lists)('gives every Work exactly one slot and keeps the order (%#)', (...items) => {
    const placed = featuredGroups(items).flat()
    expect(placed.map(({ item }) => item)).toEqual(items)
  })

  it.each(lists)('cycles the slots A, B, C through the whole list (%#)', (...items) => {
    const slots = featuredGroups(items)
      .flat()
      .map(({ slot }) => slot)
    slots.forEach((slot, index) => expect(slot).toBe(SLOTS[index % SLOTS.length]))
  })

  it.each(lists)('makes groups of three, only the last one possibly short (%#)', (...items) => {
    const groups = featuredGroups(items)
    groups.slice(0, -1).forEach((group) => expect(group).toHaveLength(3))
    if (groups.length) expect(groups.at(-1)!.length).toBeLessThanOrEqual(3)
    expect(groups).toHaveLength(Math.ceil(items.length / 3))
  })

  it('has no groups for no Works', () => {
    expect(featuredGroups([])).toEqual([])
  })

  it('places four Works as A, B, C and then A again in a second group', () => {
    expect(featuredGroups(['a', 'b', 'c', 'd'])).toEqual([
      [
        { slot: 'A', item: 'a' },
        { slot: 'B', item: 'b' },
        { slot: 'C', item: 'c' },
      ],
      [{ slot: 'A', item: 'd' }],
    ])
  })
})
