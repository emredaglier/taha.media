/**
 * The FLOW's card arrangement on Home (docs/frontend-structure.md): A is a wide 16:9 card on the
 * left, B a larger 16:9 card overlapping A, C a tall card on the right. The arrangement repeats
 * for each further group of three, so any number of Featured Works renders.
 */
export const SLOTS = ['A', 'B', 'C'] as const
export type Slot = (typeof SLOTS)[number]

export type Placed<T> = { slot: Slot; item: T }

/** Assigns each item a slot in turn (A, B, C, A, ...), grouped three at a time, order kept. */
export function featuredGroups<T>(items: readonly T[]): Placed<T>[][] {
  const groups: Placed<T>[][] = []
  items.forEach((item, index) => {
    const group = Math.floor(index / SLOTS.length)
    ;(groups[group] ??= []).push({ slot: SLOTS[index % SLOTS.length]!, item })
  })
  return groups
}
