import { HAND_TUNING } from './hand-tuning'
import type { Step } from './lightbox-step'

/**
 * Hand control's grab as steps (#59, the Galeri lightbox): the hand's horizontal movement, in
 * screen widths, turns into one step each time it adds up to `HAND_TUNING.grab.stepWidths`. Moving
 * left pulls the next item in (`1`), moving right brings the previous back (`-1`), as a swipe does.
 * After a step the count starts again from nothing, so one movement, however large (the grab's
 * catch-up), takes at most one step, and a hand shaking around the crossing never takes a second.
 * `reset` drops what a grab left short of a step, when it lets go.
 */
export function createHandStepper(onStep: (step: Step) => void) {
  let travel = 0
  return {
    /** The grab moved `right` screen widths (negative: left). */
    move(right: number) {
      travel += right
      if (Math.abs(travel) < HAND_TUNING.grab.stepWidths) return
      const step: Step = travel < 0 ? 1 : -1
      travel = 0
      onStep(step)
    },
    reset() {
      travel = 0
    },
  }
}

export type HandStepper = ReturnType<typeof createHandStepper>
