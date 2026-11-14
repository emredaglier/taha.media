import { describe, expect, it } from 'vitest'

import { crtWarp } from './crt'

describe('the CRT bend', () => {
  it('leaves the centre where it is', () => {
    expect(crtWarp(0, 0, 16 / 9, 0.05)).toEqual({ x: 0, y: 0 })
  })

  it('keeps the corners on the corners and never reads past the picture (no rim)', () => {
    const corner = crtWarp(1, 1, 16 / 9, 0.1)
    expect(corner.x).toBeCloseTo(1)
    expect(corner.y).toBeCloseTo(1)
    for (let x = -1; x <= 1; x += 0.25)
      for (let y = -1; y <= 1; y += 0.25) {
        const p = crtWarp(x, y, 16 / 9, 0.1)
        expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-9)
        expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-9)
      }
  })

  it('bulges: the middle is magnified more than the edges', () => {
    const near = crtWarp(0.1, 0, 16 / 9, 0.1).x / 0.1
    const edge = crtWarp(1, 0, 16 / 9, 0.1).x
    expect(near).toBeLessThan(edge)
  })

  it('is symmetric about the centre', () => {
    const a = crtWarp(0.6, -0.3, 1.5, 0.05)
    const b = crtWarp(-0.6, 0.3, 1.5, 0.05)
    expect(b.x).toBeCloseTo(-a.x)
    expect(b.y).toBeCloseTo(-a.y)
  })

  it('is round: the same distance from the centre in px bends the same either way', () => {
    // A 2:1 screen: 0.5 across is as far from the centre as 1 up, in px.
    const across = crtWarp(0.5, 0, 2, 0.05)
    const up = crtWarp(0, 1, 2, 0.05)
    expect(across.x / 0.5).toBeCloseTo(up.y / 1)
  })

  it('does nothing at bend 0', () => {
    expect(crtWarp(0.7, -0.4, 16 / 9, 0)).toEqual({ x: 0.7, y: -0.4 })
  })
})
