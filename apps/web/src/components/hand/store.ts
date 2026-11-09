import { useSyncExternalStore } from 'react'

import {
  handControl,
  initialHandControl,
  type HandControlEffect,
  type HandControlEvent,
  type HandControlState,
} from '../../lib/hand-control'

/*
 * Hand control's one state, shared by the toggle (in the header) and the controller (in the root
 * layout): both live across client-side navigation, and neither owns the other. The controller
 * registers itself as the runner of the effects (the camera, the tracker).
 */
let state: HandControlState = initialHandControl
const listeners = new Set<() => void>()
let runner: ((effect: HandControlEffect) => void) | null = null

/** Applies `event`, tells every subscriber, then runs the effects. */
export function dispatchHand(event: HandControlEvent): void {
  const step = handControl(state, event)
  if (step.state !== state) {
    state = step.state
    for (const listener of listeners) listener()
  }
  for (const effect of step.effects) runner?.(effect)
}

/** The controller runs the effects while it is mounted. Returns the undo. */
export function setHandRunner(run: (effect: HandControlEffect) => void): () => void {
  runner = run
  return () => {
    if (runner === run) runner = null
  }
}

/** The current state, outside React (the controller's effects read the current attempt). */
export const handState = (): HandControlState => state

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Hand control's state, live; off on the server and in the first client render. */
export const useHandControl = (): HandControlState =>
  useSyncExternalStore(subscribe, handState, () => initialHandControl)
