import { useSyncExternalStore } from 'react'

/**
 * How a loop may play (ADR-0101: motion is an enhancement):
 * - `poster`: never plays; the poster image stays (reduced motion, Save-Data, and before hydration).
 * - `view`: plays while in view.
 * - `hover`: plays while the pointer is over its card (fine pointers only).
 */
export type LoopMode = 'poster' | 'view' | 'hover'

export function chooseLoopMode(options: {
  reducedMotion: boolean
  saveData: boolean
  finePointer: boolean
  /** Cards play on hover when the pointer allows it; everything else plays in view. */
  hoverToPlay: boolean
}): LoopMode {
  if (options.reducedMotion || options.saveData) return 'poster'
  return options.hoverToPlay && options.finePointer ? 'hover' : 'view'
}

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
/** A mouse or trackpad, and a pointer that can hover: Hand control's toggle reads them apart. */
export const POINTER_FINE = '(pointer: fine)'
export const CAN_HOVER = '(hover: hover)'
const FINE_POINTER = `${CAN_HOVER} and ${POINTER_FINE}`

type Connection = EventTarget & { saveData?: boolean }
const connection = (): Connection | undefined =>
  (navigator as Navigator & { connection?: Connection }).connection

/** Whether the visitor asked for Save-Data. */
export const saveDataOn = (): boolean => connection()?.saveData === true

/** Calls `onChange` when any of these media queries or Save-Data changes. Returns the undo. */
export function subscribeToQueries(media: readonly string[], onChange: () => void): () => void {
  const queries = media.map((query) => matchMedia(query))
  const network = connection()
  for (const query of queries) query.addEventListener('change', onChange)
  network?.addEventListener('change', onChange)
  return () => {
    for (const query of queries) query.removeEventListener('change', onChange)
    network?.removeEventListener('change', onChange)
  }
}

/** Calls `onChange` when reduced motion, the pointer or Save-Data changes. Returns the undo. */
export const subscribeToPreferences = (onChange: () => void): (() => void) =>
  subscribeToQueries([REDUCED_MOTION, FINE_POINTER], onChange)

const snapshot = (hoverToPlay: boolean): LoopMode =>
  chooseLoopMode({
    reducedMotion: matchMedia(REDUCED_MOTION).matches,
    saveData: saveDataOn(),
    finePointer: matchMedia(FINE_POINTER).matches,
    hoverToPlay,
  })

/** The mode for this device, live; the server and the first client render say `poster`. */
export function useLoopMode(hoverToPlay: boolean): LoopMode {
  return useSyncExternalStore(
    subscribeToPreferences,
    () => snapshot(hoverToPlay),
    () => 'poster',
  )
}
