import { describe, expect, it } from 'vitest'

import { HAND_TUNING } from '../../lib/hand-tuning'
import {
  createHelix,
  isResting,
  stepHelix,
  type HelixInput,
  type HelixState,
} from '../../lib/helix-motion'
import { helixGrab } from './hand-grab'

/*
 * Hand control's grab on Home (#57) feeds the Helix's motion model as a drag does: while the zoom
 * runs the page takes it (its scroll scrubs the zoom), and once Home holds the screen it turns the
 * Helix, which settles on a card by itself when the hand lets go.
 */

const FRAME_MS = 1000 / 60

/** A Helix of 8 Works at rest, fed through the real step function on a clock. */
const helix = () => {
  let state: HelixState = createHelix(8)
  let now = 0
  const inputs: HelixInput['kind'][] = []
  return {
    apply: (input: HelixInput) => {
      inputs.push(input.kind)
      state = stepHelix(state, input, now)
    },
    run: (ms: number) => {
      for (const end = now + ms; now < end;) {
        now += FRAME_MS
        state = stepHelix(state, { kind: 'frame' }, now)
      }
    },
    get state() {
      return state
    },
    inputs,
  }
}

describe("the hand's grab on Home", () => {
  it('leaves the grab to the page while the zoom runs, so the page scroll scrubs it', () => {
    const model = helix()
    const grab = helixGrab({ turns: () => false, apply: model.apply })
    expect(grab.move(0.1)).toBe(false)
    expect(grab.end()).toBe(false)
    expect(model.inputs).toEqual([])
  })

  it('turns the Helix like a drag once Home holds the screen: up turns forward', () => {
    const model = helix()
    const grab = helixGrab({ turns: () => true, apply: model.apply })
    // Half a screen up, over a quarter of a second.
    for (let i = 0; i < 15; i++) {
      expect(grab.move(0.5 / 15)).toBe(true)
      model.run(FRAME_MS)
    }
    expect(model.inputs[0]).toBe('dragStart')
    expect(model.inputs.filter((kind) => kind === 'dragStart')).toHaveLength(1)
    // The goal moved by the tuned number of cards per screen height.
    expect(model.state.goal).toBeCloseTo(0.5 * HAND_TUNING.grab.turnCards, 6)
    expect(model.state.progress).toBeGreaterThan(0)
  })

  it('lets go as a drag does: the Helix settles on a whole card by itself', () => {
    const model = helix()
    const grab = helixGrab({ turns: () => true, apply: model.apply })
    for (let i = 0; i < 10; i++) {
      grab.move(0.03)
      model.run(FRAME_MS)
    }
    expect(grab.end()).toBe(true)
    expect(model.inputs.at(-1)).toBe('dragEnd')
    model.run(3000)
    expect(isResting(model.state)).toBe(true)
    expect(Number.isInteger(model.state.progress)).toBe(true)
    expect(model.state.progress).toBeGreaterThanOrEqual(1)
  })

  it('takes over mid-grab when the melt locks the page, and lets go once', () => {
    const model = helix()
    let locked = false
    const grab = helixGrab({ turns: () => locked, apply: model.apply })
    expect(grab.move(0.05)).toBe(false)
    locked = true
    expect(grab.move(0.05)).toBe(true)
    expect(grab.move(0.05)).toBe(true)
    expect(grab.end()).toBe(true)
    expect(grab.end()).toBe(false)
    expect(model.inputs).toEqual(['dragStart', 'dragMove', 'dragMove', 'dragEnd'])
  })

  it('tells the Helix when a grab starts turning it (no card is hovered meanwhile)', () => {
    const model = helix()
    let started = 0
    const grab = helixGrab({ turns: () => true, apply: model.apply, onStart: () => started++ })
    grab.move(0.05)
    grab.move(0.05)
    expect(started).toBe(1)
    expect(grab.holding).toBe(true)
    grab.end()
    expect(grab.holding).toBe(false)
  })
})
