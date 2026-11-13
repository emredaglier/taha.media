import { WEAK_DEVICE } from '../lib/weak-device'

/** What a test may set: a key left out keeps the pinned value; `memory: undefined` means "not reported". */
export type DeviceOverride = { cores?: number; memory?: number }

const { minCores, minMemoryGb } = WEAK_DEVICE

/** The device every test sees unless it overrides it: comfortably above the weak-device line. */
export const PINNED_DEVICE = { cores: minCores * 2, memory: minMemoryGb * 2 }

const define = (name: 'hardwareConcurrency' | 'deviceMemory', value: number | undefined) =>
  Object.defineProperty(navigator, name, { configurable: true, value })

/**
 * Overrides what `navigator` reports about the device, for one test (`device-setup.ts` pins it
 * again before the next). Pass `memory: undefined` for a browser that doesn't report memory, as
 * Safari and Firefox don't. Only for tests with a `navigator` (jsdom).
 */
export function setDevice(override: DeviceOverride = {}): void {
  const { cores, memory } = { ...PINNED_DEVICE, ...override }
  define('hardwareConcurrency', cores)
  define('deviceMemory', memory)
}
