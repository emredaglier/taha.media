import { describe, expect, it } from 'vitest'
import { FRAME_WRAP, nextFrame } from './frame-count'

describe('nextFrame', () => {
  it('counts up by one per frame', () => {
    expect(nextFrame(0)).toBe(1)
    expect(nextFrame(41)).toBe(42)
  })

  it('wraps to 0 after the last frame, so the counter stays small', () => {
    expect(nextFrame(FRAME_WRAP - 1)).toBe(0)
  })

  it('gives every frame in one wrap a different number', () => {
    const seen = new Set<number>()
    let frame = 0
    for (let i = 0; i < FRAME_WRAP; i++) {
      seen.add(frame)
      frame = nextFrame(frame)
    }
    expect(seen.size).toBe(FRAME_WRAP)
  })
})
