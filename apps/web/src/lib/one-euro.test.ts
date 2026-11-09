import { describe, expect, it } from 'vitest'

import { HAND_TUNING } from './hand-tuning'
import { oneEuro, type OneEuroParams, type OneEuroState } from './one-euro'

const params = HAND_TUNING.filter
const FRAME_MS = 1000 / 30

/** Runs the filter over `values`, one camera frame apart, and returns every output. */
const run = (values: readonly number[], options: OneEuroParams = params) => {
  let state: OneEuroState | null = null
  return values.map((value, frame) => {
    state = oneEuro(state, value, frame * FRAME_MS, options)
    return state.value
  })
}

/** A repeatable stand-in for camera noise: a small LCG, -1 to 1. */
const noise = (seed: number) => {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32
    return (s / 2 ** 32) * 2 - 1
  }
}

describe('the one-euro filter', () => {
  it('passes the first sample through', () => {
    expect(oneEuro(null, 0.42, 1000, params).value).toBe(0.42)
  })

  it('holds a constant input', () => {
    expect(run(Array(30).fill(0.3)).every((v) => Math.abs(v - 0.3) < 1e-12)).toBe(true)
  })

  it('follows a step without overshooting, and settles on it', () => {
    const out = run([0, ...Array(90).fill(1)])
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!).toBeGreaterThanOrEqual(out[i - 1]!)
      expect(out[i]!).toBeLessThanOrEqual(1)
    }
    expect(out[1]!).toBeLessThan(0.5) // smoothed, not a jump
    expect(out.at(-1)!).toBeGreaterThan(0.99)
  })

  it('smooths jitter: the output spreads far less than the input', () => {
    const next = noise(7)
    const input = Array.from({ length: 120 }, () => 0.5 + 0.01 * next())
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs)
    // Skip the first second, while it settles from the first sample.
    expect(spread(run(input).slice(30))).toBeLessThan(spread(input.slice(30)) / 2)
  })

  it('lags less on a fast move the higher beta is (the speed opens the cutoff)', () => {
    const ramp = Array.from({ length: 30 }, (_, i) => i * 0.05)
    const lag = (beta: number) => ramp.at(-1)! - run(ramp, { ...params, beta }).at(-1)!
    expect(lag(1)).toBeLessThan(lag(0))
  })
})
