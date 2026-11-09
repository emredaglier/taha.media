import { HAND_TUNING } from '../../lib/hand-tuning'
import type { HelixInput } from '../../lib/helix-motion'
import { HELIX_TUNING } from '../../lib/helix-tuning'
import type { GrabSink } from '../hand/grab'

/**
 * Hand control's grab on Home (#57), as the Helix takes it: the same inputs as a vertical drag
 * (`dragStart`, `dragMove`, `dragEnd`), so the motion model follows and then settles on a card as
 * it does for a mouse or a finger. Only while `turns()` says the Helix takes input (Home holds the
 * screen, the menu is shut); before that the move is left to the page, whose scroll scrubs the
 * zoom. A grab that began on the page is taken over at the first move after the melt. The hand
 * moves `up` screen heights; the Helix turns `HAND_TUNING.grab.turnCards` cards per screen height,
 * given to the model in drag pixels. `onStart` runs when a grab starts turning the Helix.
 */
export function helixGrab({
  turns,
  apply,
  onStart,
}: {
  turns: () => boolean
  apply: (input: HelixInput) => void
  onStart?: () => void
}): GrabSink & { readonly holding: boolean } {
  let holding = false
  return {
    get holding() {
      return holding
    },
    move(up) {
      if (!holding) {
        if (!turns()) return false
        holding = true
        onStart?.()
        apply({ kind: 'dragStart' })
      }
      apply({ kind: 'dragMove', up: (up * HAND_TUNING.grab.turnCards) / HELIX_TUNING.dragScale })
      return true
    },
    end() {
      if (!holding) return false
      holding = false
      apply({ kind: 'dragEnd' })
      return true
    },
  }
}
