import { describe, expect, it } from 'vitest'

import { createHandStepper } from './hand-steps'
import { HAND_TUNING } from './hand-tuning'
import type { Step } from './lightbox-step'

const { stepWidths } = HAND_TUNING.grab

/** A stepper and every step it took. */
const stepper = () => {
  const steps: Step[] = []
  return { steps, stepper: createHandStepper((step) => steps.push(step)) }
}

/** `total` screen widths, in `count` equal moves. */
const moves = (total: number, count: number) => Array<number>(count).fill(total / count)

describe('the hand stepper (#59)', () => {
  it('a grab moving left one threshold steps to the next item, once', () => {
    const { steps, stepper: s } = stepper()
    for (const right of moves(-stepWidths * 1.05, 10)) s.move(right)
    expect(steps).toEqual([1])
  })

  it('a grab moving right one threshold steps back to the previous item, once', () => {
    const { steps, stepper: s } = stepper()
    for (const right of moves(stepWidths * 1.05, 10)) s.move(right)
    expect(steps).toEqual([-1])
  })

  it('a move short of the threshold steps nowhere', () => {
    const { steps, stepper: s } = stepper()
    for (const right of moves(-stepWidths * 0.95, 10)) s.move(right)
    expect(steps).toEqual([])
  })

  it('never takes two steps from one movement, however large (a catch-up)', () => {
    const { steps, stepper: s } = stepper()
    s.move(-stepWidths * 3.5)
    expect(steps).toEqual([1])
    // Nor later: what it carried past the step is dropped, so a nudge right after takes none.
    s.move(-stepWidths * 0.05)
    expect(steps).toEqual([1])
  })

  it('re-arms after a step: jitter around the crossing never steps again', () => {
    const { steps, stepper: s } = stepper()
    for (const right of moves(-stepWidths * 1.01, 10)) s.move(right)
    // The hand shakes back and forth by a tenth of the threshold, many times.
    for (let i = 0; i < 40; i++) s.move((i % 2 === 0 ? 1 : -1) * stepWidths * 0.1)
    expect(steps).toEqual([1])
  })

  it('takes one step per threshold the hand travels in one grab', () => {
    const { steps, stepper: s } = stepper()
    for (const right of moves(-stepWidths * 3.2, 64)) s.move(right)
    expect(steps).toEqual([1, 1, 1])
  })

  it('turning back steps back: left one threshold, then right one, is next then previous', () => {
    const { steps, stepper: s } = stepper()
    for (const right of moves(-stepWidths * 1.05, 10)) s.move(right)
    for (const right of moves(stepWidths * 1.05, 10)) s.move(right)
    expect(steps).toEqual([1, -1])
  })

  it('a new grab starts from nothing: a short move left over from the last one is dropped', () => {
    const { steps, stepper: s } = stepper()
    s.move(-stepWidths * 0.9)
    s.reset()
    s.move(-stepWidths * 0.9)
    expect(steps).toEqual([])
  })
})
