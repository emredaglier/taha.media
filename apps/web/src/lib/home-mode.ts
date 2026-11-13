import { useSyncExternalStore } from 'react'

import { REDUCED_MOTION, saveDataOn, subscribeToPreferences } from './loop-mode'
import { deviceReport, isWeakDevice, type DeviceReport } from './weak-device'

/**
 * Which Home a visitor gets (ADR-0103, ADR-0101: motion is an enhancement):
 * - `room`: the Edit Room, built on top of the static Home (for now the Helix of Featured Works).
 * - `static`: the static Home alone (the hero, then the Featured Works as plain cards).
 */
export type HomeMode = 'room' | 'static'

/** Any one disqualifier gives the static Home; the room needs at least one Featured Work. */
export function chooseHomeMode(
  options: DeviceReport & {
    reducedMotion: boolean
    saveData: boolean
    webgl2: boolean
    featuredCount: number
  },
): HomeMode {
  if (options.reducedMotion || options.saveData || !options.webgl2) return 'static'
  if (isWeakDevice(options) || options.featuredCount < 1) return 'static'
  return 'room'
}

const snapshot = (featuredCount: number): HomeMode =>
  chooseHomeMode({
    reducedMotion: matchMedia(REDUCED_MOTION).matches,
    saveData: saveDataOn(),
    // Whether the browser has WebGL2 at all. A context that still fails to start (a blocked GPU)
    // brings the static Home back from the room itself.
    webgl2: typeof WebGL2RenderingContext !== 'undefined',
    ...deviceReport(),
    featuredCount,
  })

/**
 * The Home for this device, live (turning on reduced motion or Save-Data brings the static Home
 * back); the server and the first client render say `static`.
 */
export function useHomeMode(featuredCount: number): HomeMode {
  return useSyncExternalStore(
    subscribeToPreferences,
    () => snapshot(featuredCount),
    () => 'static',
  )
}
