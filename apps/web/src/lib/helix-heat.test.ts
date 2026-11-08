import { describe, expect, it } from 'vitest'

import { HEAT_AT_REST, planHeat, type HeatCarry, type PointerPath } from './helix-heat'
import { HELIX_TUNING } from './helix-tuning'

const { stepsPerSecond, maxSteps, push, fullSpeed } = HELIX_TUNING.heat

/** Frame rates to check: slow laptops, the common 60 Hz, and fast screens. */
const FRAME_RATES = [24, 30, 50, 60, 75, 90, 120, 144, 165, 240]

const path = (speed: number, from = { x: 0.2, y: 0.5 }, to = { x: 0.3, y: 0.5 }): PointerPath => ({
  from,
  to,
  speed,
})

/** Runs `frames` frames of `dt` seconds with no pointer, and counts the steps. */
function stepsOver(frames: number, dt: number): number {
  let carry: HeatCarry = HEAT_AT_REST
  let steps = 0
  for (let frame = 0; frame < frames; frame++) {
    const plan = planHeat(carry, dt, null)
    steps += plan.steps
    carry = plan.carry
  }
  return steps
}

describe('planHeat: how many steps a frame runs', () => {
  it.each(FRAME_RATES)('runs the trail at its own rate at %i frames per second', (fps) => {
    // Ten seconds of frames: the same number of steps whatever the screen's rate (give or take one).
    const steps = stepsOver(fps * 10, 1 / fps)
    expect(Math.abs(steps - stepsPerSecond * 10)).toBeLessThanOrEqual(1)
  })

  it('runs no frame on by more than the most steps a frame may run (a stalled tab)', () => {
    expect(planHeat(HEAT_AT_REST, 5, null).steps).toBe(maxSteps)
    // And nothing is owed afterwards: the next ordinary frame runs as usual.
    const after = planHeat(planHeat(HEAT_AT_REST, 5, null).carry, 1 / stepsPerSecond, null)
    expect(after.steps).toBeLessThanOrEqual(1)
  })

  it('runs no step for no time', () => {
    expect(planHeat(HEAT_AT_REST, 0, path(fullSpeed)).steps).toBe(0)
  })
})

describe('planHeat: the cursor splat', () => {
  const oneStep = 1 / stepsPerSecond

  it('splats nothing while there is no pointer over the Helix', () => {
    expect(planHeat(HEAT_AT_REST, oneStep, null).splat).toBeNull()
  })

  it('splats along the pointer path, harder the faster it moves, up to the full push', () => {
    const from = { x: 0.1, y: 0.2 }
    const to = { x: 0.4, y: 0.6 }
    expect(planHeat(HEAT_AT_REST, oneStep, path(fullSpeed / 2, from, to)).splat).toEqual({
      from,
      to,
      strength: push / 2,
    })
    expect(planHeat(HEAT_AT_REST, oneStep, path(fullSpeed)).splat?.strength).toBe(push)
    expect(planHeat(HEAT_AT_REST, oneStep, path(fullSpeed * 3)).splat?.strength).toBe(push)
    expect(planHeat(HEAT_AT_REST, oneStep, path(0)).splat?.strength).toBe(0)
  })

  it('keeps a move from a frame that runs no step for the next step, joined to the later move', () => {
    const halfStep = oneStep / 2
    const first = planHeat(HEAT_AT_REST, halfStep, path(fullSpeed / 4, { x: 0.1, y: 0.1 }))
    expect(first.steps).toBe(0)
    expect(first.splat).toBeNull()
    const second = planHeat(
      first.carry,
      halfStep,
      path(fullSpeed / 2, { x: 0.3, y: 0.3 }, { x: 0.5, y: 0.5 }),
    )
    expect(second.steps).toBe(1)
    // From where the pointer was at the first frame to where it is now, at the faster speed.
    expect(second.splat).toEqual({
      from: { x: 0.1, y: 0.1 },
      to: { x: 0.5, y: 0.5 },
      strength: push / 2,
    })
    // Spent: the frame after that splats nothing without a new move.
    expect(planHeat(second.carry, oneStep, null).splat).toBeNull()
  })

  it('splats once in a frame that runs several steps', () => {
    const plan = planHeat(HEAT_AT_REST, oneStep * 3, path(fullSpeed))
    expect(plan.steps).toBe(3)
    expect(plan.splat?.strength).toBe(push)
    expect(plan.carry.pending).toBeNull()
  })
})
