import { describe, expect, it } from 'vitest'

import {
  isPlainClick,
  keyAction,
  lightboxLabel,
  positionLabel,
  SWIPE_MIN_DISTANCE,
  swipeAction,
} from './lightbox-input'

const key = (name: string, modifiers: Partial<Record<string, boolean>> = {}) =>
  keyAction({
    key: name,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...modifiers,
  })

describe('keyAction', () => {
  it('maps Escape to close and the left and right arrows to previous and next', () => {
    expect(key('Escape')).toBe('close')
    expect(key('ArrowLeft')).toBe('previous')
    expect(key('ArrowRight')).toBe('next')
  })

  it.each(['ArrowUp', 'ArrowDown', 'Enter', ' ', 'Tab', 'a', 'Home', 'PageDown'])(
    'leaves %j to the browser',
    (name) => {
      expect(key(name)).toBeNull()
    },
  )

  // Alt+Left is the browser's Back and Cmd+Left its Back on macOS: the lightbox must not steal them.
  it.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey'])(
    'does not act on an arrow pressed with %s',
    (modifier) => {
      expect(key('ArrowLeft', { [modifier]: true })).toBeNull()
      expect(key('ArrowRight', { [modifier]: true })).toBeNull()
    },
  )
})

describe('swipeAction', () => {
  const far = SWIPE_MIN_DISTANCE * 2

  it('goes to the next item for a swipe left and the previous for a swipe right', () => {
    expect(swipeAction(-far, 0)).toBe('next')
    expect(swipeAction(far, 0)).toBe('previous')
  })

  it.each([0, 5, 20, SWIPE_MIN_DISTANCE, 90])(
    'is mirrored: the same swipe the other way gives the opposite step, up or down alike (dy %i)',
    (dy) => {
      const opposite = { next: 'previous', previous: 'next' } as const
      for (const dx of [SWIPE_MIN_DISTANCE, far, 400]) {
        const left = swipeAction(-dx, dy)
        expect(swipeAction(dx, dy)).toBe(left === null ? null : opposite[left])
        expect(swipeAction(-dx, -dy)).toBe(left)
      }
    },
  )

  it('ignores a short swipe, a tap and the edge just under the threshold', () => {
    expect(swipeAction(0, 0)).toBeNull()
    expect(swipeAction(SWIPE_MIN_DISTANCE - 1, 0)).toBeNull()
    expect(swipeAction(-(SWIPE_MIN_DISTANCE - 1), 0)).toBeNull()
    expect(swipeAction(-SWIPE_MIN_DISTANCE, 0)).toBe('next')
  })

  it('ignores a swipe that is more up or down than sideways (a scroll, a diagonal)', () => {
    expect(swipeAction(-far, far * 2)).toBeNull()
    expect(swipeAction(far, -far * 2)).toBeNull()
    expect(swipeAction(-far, far)).toBeNull() // 45 degrees
  })

  it('accepts a slightly crooked swipe', () => {
    expect(swipeAction(-far, far / 4)).toBe('next')
    expect(swipeAction(far, -far / 4)).toBe('previous')
  })
})

describe('isPlainClick', () => {
  const click = (modifiers: Partial<Record<string, boolean | number>> = {}) =>
    isPlainClick({
      button: 0,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      ...modifiers,
    })

  it('is true for a plain left click, which opens the lightbox', () => {
    expect(click()).toBe(true)
  })

  // Anything else is the visitor asking the browser for the file (new tab, new window, download).
  it.each([
    { metaKey: true },
    { ctrlKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
  ])('is false for %o, which keep the link to the file', (modifiers) => {
    expect(click(modifiers)).toBe(false)
  })
})

describe('positionLabel', () => {
  it('counts from one', () => {
    expect(positionLabel(0, 12)).toBe('1 / 12')
    expect(positionLabel(11, 12)).toBe('12 / 12')
  })
})

describe('lightboxLabel', () => {
  it('names the dialog for a screen reader, with the place in the Gallery', () => {
    expect(lightboxLabel(2, 12, null)).toBe('Galeri, 3 / 12')
  })

  it('adds the caption when there is one, and ignores a blank one', () => {
    expect(lightboxLabel(0, 4, 'Set günü')).toBe('Galeri, 1 / 4: Set günü')
    expect(lightboxLabel(0, 4, '  ')).toBe('Galeri, 1 / 4')
  })
})
