import { describe, expect, it } from 'vitest'

import { showHandToggle, type HandToggleInputs } from './hand-toggle'

/** A desktop with a mouse and a camera, nothing asked for: the toggle shows. */
const desktop: HandToggleInputs = {
  finePointer: true,
  hover: true,
  hasCamera: true,
  saveData: false,
  weakDevice: false,
}

describe('the Elinle gez toggle', () => {
  it('shows on a desktop with a fine hovering pointer and a camera', () => {
    expect(showHandToggle(desktop)).toBe(true)
  })

  it.each<[string, Partial<HandToggleInputs>]>([
    ['a coarse pointer (a phone or tablet)', { finePointer: false }],
    ['a pointer that cannot hover', { hover: false }],
    ['no camera', { hasCamera: false }],
    ['Save-Data', { saveData: true }],
    ['a weak device', { weakDevice: true }],
  ])('hides with %s', (_, change) => {
    expect(showHandToggle({ ...desktop, ...change })).toBe(false)
  })
})
