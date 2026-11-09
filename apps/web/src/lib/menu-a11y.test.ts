// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { lockScroll, nextFocus } from './menu-a11y'

describe('lockScroll', () => {
  it('sets overflow hidden on the root, then restores what was there', () => {
    document.documentElement.style.overflow = 'clip'
    const unlock = lockScroll(document.documentElement)
    expect(document.documentElement.style.overflow).toBe('hidden')
    unlock()
    expect(document.documentElement.style.overflow).toBe('clip')
    document.documentElement.style.overflow = ''
  })
})

describe('nextFocus', () => {
  const [a, b, c] = [{ n: 'a' }, { n: 'b' }, { n: 'c' }]
  const list = [a, b, c]

  it('wraps Tab from the last to the first and Shift+Tab from the first to the last', () => {
    expect(nextFocus(list, c, false)).toBe(a)
    expect(nextFocus(list, a, true)).toBe(c)
  })

  it('picks the neighbour mid-list too: Safari can skip links on its own', () => {
    expect(nextFocus(list, b, false)).toBe(c)
    expect(nextFocus(list, b, true)).toBe(a)
  })

  it('pulls focus in when it is outside the list, and handles an empty list', () => {
    expect(nextFocus(list, { n: 'x' }, false)).toBe(a)
    expect(nextFocus(list, { n: 'x' }, true)).toBe(c)
    expect(nextFocus([], a, false)).toBeNull()
  })
})
