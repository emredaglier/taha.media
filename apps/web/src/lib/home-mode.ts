import { useSyncExternalStore } from 'react'

import { CAN_HOVER, REDUCED_MOTION, saveDataOn, subscribeToPreferences } from './loop-mode'
import { deviceReport, isWeakDevice, type DeviceReport } from './weak-device'

/**
 * Which Home a visitor gets (ADR-0103, ADR-0101: motion is an enhancement):
 * - `room`: the Edit Room, built on top of the static Home.
 * - `light`: the room's light variant, for a capable device with no hover (a phone, #133).
 * - `static`: the static Home alone (the hero, then the Featured Works as plain cards).
 */
export type HomeMode = 'room' | 'light' | 'static'

/** Any one disqualifier gives the static Home; the room needs at least one Featured Work. */
export function chooseHomeMode(
  options: DeviceReport & {
    reducedMotion: boolean
    saveData: boolean
    webgl2: boolean
    hover: boolean
    featuredCount: number
  },
): HomeMode {
  if (options.reducedMotion || options.saveData || !options.webgl2) return 'static'
  if (isWeakDevice(options) || options.featuredCount < 1) return 'static'
  return options.hover ? 'room' : 'light'
}

const snapshot = (featuredCount: number): HomeMode =>
  chooseHomeMode({
    reducedMotion: matchMedia(REDUCED_MOTION).matches,
    saveData: saveDataOn(),
    // Whether the browser has WebGL2 at all. A context that still fails to start (a blocked GPU)
    // brings the static Home back from the room itself.
    webgl2: typeof WebGL2RenderingContext !== 'undefined',
    hover: matchMedia(CAN_HOVER).matches,
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
