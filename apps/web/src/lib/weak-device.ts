/** Below either value the device is weak (a value the browser doesn't report passes). */
export const WEAK_DEVICE = { minMemoryGb: 4, minCores: 4 }

/** What the browser says about the device. A value it doesn't report is `undefined`. */
export type DeviceReport = {
  /** `navigator.deviceMemory`, in GB. */
  deviceMemory?: number
  /** `navigator.hardwareConcurrency`. */
  cores?: number
}

/**
 * A weak device reports under the tuned memory or core count. A value the browser doesn't report
 * passes, so Safari and Firefox (no `deviceMemory`) are judged by their cores alone. The Home mode,
 * the melt layer and Hand control's toggle all use this test.
 */
export function isWeakDevice({ deviceMemory, cores }: DeviceReport): boolean {
  const { minMemoryGb, minCores } = WEAK_DEVICE
  return (
    (deviceMemory !== undefined && deviceMemory < minMemoryGb) ||
    (cores !== undefined && cores > 0 && cores < minCores)
  )
}

/** What this browser reports about the device. */
export const deviceReport = (): DeviceReport => ({
  deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  // 0 or missing means not reported.
  cores: navigator.hardwareConcurrency || undefined,
})
