import { useSyncExternalStore } from 'react'

import { HELIX_TUNING } from './helix-tuning'
import { REDUCED_MOTION, saveDataOn, subscribeToPreferences } from './loop-mode'

/**
 * Which Home a visitor gets (ADR-0103, ADR-0101: motion is an enhancement):
 * - `helix`: the Helix of Featured Works, built on top of the static Home.
 * - `static`: the static Home alone (the hero, then the Featured Works as plain cards).
 */
export type HomeMode = 'helix' | 'static'

/** What the browser says about the device. A value it doesn't report is `undefined`. */
export type DeviceReport = {
  /** `navigator.deviceMemory`, in GB. */
  deviceMemory?: number
  /** `navigator.hardwareConcurrency`. */
  cores?: number
}

/**
 * A weak device reports under the tuned memory or core count. A value the browser doesn't report
 * passes, so Safari and Firefox (no `deviceMemory`) are judged by their cores alone. Hand control
 * reuses this test.
 */
export function isWeakDevice({ deviceMemory, cores }: DeviceReport): boolean {
  const { minMemoryGb, minCores } = HELIX_TUNING.weakDevice
  return (
    (deviceMemory !== undefined && deviceMemory < minMemoryGb) ||
    (cores !== undefined && cores > 0 && cores < minCores)
  )
}

/** Any one disqualifier gives the static Home; the Helix needs at least one Featured Work. */
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
  return 'helix'
}

/** What this browser reports about the device. Hand control's toggle reads it too. */
export const deviceReport = (): DeviceReport => ({
  deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  // 0 or missing means not reported.
  cores: navigator.hardwareConcurrency || undefined,
})

const snapshot = (featuredCount: number): HomeMode =>
  chooseHomeMode({
    reducedMotion: matchMedia(REDUCED_MOTION).matches,
    saveData: saveDataOn(),
    // Whether the browser has WebGL2 at all. A context that still fails to start (a blocked GPU)
    // brings the static Home back from the Helix itself.
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
