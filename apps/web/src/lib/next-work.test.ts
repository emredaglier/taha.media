import { describe, expect, it } from 'vitest'

import { nextWork } from './next-work'

const lists = [
  ['a', 'b'],
  ['a', 'b', 'c'],
  ['x', 'y', 'z', 'w', 'v', 'u', 't'],
]

describe('nextWork', () => {
  it('gives the following Work, and wraps to the first after the last', () => {
    expect(nextWork(['a', 'b', 'c'], 'a')).toBe('b')
    expect(nextWork(['a', 'b', 'c'], 'b')).toBe('c')
    expect(nextWork(['a', 'b', 'c'], 'c')).toBe('a')
  })

  it.each(lists)('wraps at the end of %j', (...list) => {
    expect(nextWork(list, list.at(-1)!)).toBe(list[0])
  })

  it.each(lists)(
    'visits every Work exactly once from any start, then returns to it: %j',
    (...list) => {
      for (const start of list) {
        const visited = [start]
        let current = nextWork(list, start)
        while (current !== start) {
          visited.push(current!)
          current = nextWork(list, current!)
          expect(visited.length).toBeLessThanOrEqual(list.length)
        }
        expect([...visited].sort()).toEqual([...list].sort())
      }
    },
  )

  it('is null when there is only one Work', () => {
    expect(nextWork(['a'], 'a')).toBeNull()
  })

  it('is null when the current Work is not in the list', () => {
    expect(nextWork(['a', 'b'], 'z')).toBeNull()
    expect(nextWork([], 'a')).toBeNull()
  })
})
