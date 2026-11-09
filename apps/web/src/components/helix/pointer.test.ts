import { describe, expect, it, vi } from 'vitest'

import { capturePointer } from './pointer'

/** An element whose browser knows only pointer 1, as a browser throws for any other id. */
const element = () => ({
  setPointerCapture: vi.fn((id: number) => {
    if (id !== 1) throw new DOMException('No active pointer with the given id', 'NotFoundError')
  }),
})

describe('capturing a press on the Helix', () => {
  it('captures a real pointer, so a drag keeps going off the canvas', () => {
    const canvas = element()
    capturePointer(canvas as unknown as Element, 1)
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(1)
  })

  it("leaves Hand control's synthetic press uncaptured, without throwing", () => {
    const canvas = element()
    expect(() => capturePointer(canvas as unknown as Element, 7001)).not.toThrow()
  })
})
