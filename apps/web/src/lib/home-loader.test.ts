import { afterEach, describe, expect, it, vi } from 'vitest'

import { HELIX_TUNING } from './helix-tuning'
import { LOADER_TIMEOUT_MS, LOADING_CLASS, loaderScript } from './home-loader'
import { chooseHomeMode } from './home-mode'

type Device = {
  reducedMotion: boolean
  saveData: boolean
  webgl2: boolean
  deviceMemory?: number
  cores?: number
  /** The page's path; Home unless given. */
  path?: string
}

/** Runs the inline script against a window that reports `device`; returns the page's root. */
function run(device: Device) {
  const classes = new Set<string>()
  const root = {
    classList: {
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
    },
  }
  const window = {
    matchMedia: (query: string) => ({ matches: device.reducedMotion && query.includes('reduce') }),
    navigator: {
      deviceMemory: device.deviceMemory,
      hardwareConcurrency: device.cores ?? 0,
      connection: { saveData: device.saveData },
    },
    WebGL2RenderingContext: device.webgl2 ? class {} : undefined,
    document: { documentElement: root },
    location: { pathname: device.path ?? '/' },
    setTimeout,
  }
  new Function('window', loaderScript())(window)
  return { loading: () => classes.has(LOADING_CLASS) }
}

const { minMemoryGb, minCores } = HELIX_TUNING.weakDevice
const capable: Device = { reducedMotion: false, saveData: false, webgl2: true, cores: minCores }

afterEach(() => {
  vi.useRealTimers()
})

describe('the Home loader: shown only to a device that will get the Helix', () => {
  it('shows on a capable device', () => {
    expect(run(capable).loading()).toBe(true)
  })

  it('shows on Home only', () => {
    expect(run({ ...capable, path: '/isler' }).loading()).toBe(false)
  })

  it('is skipped under reduced motion, Save-Data, without WebGL2 and on a weak device', () => {
    expect(run({ ...capable, reducedMotion: true }).loading()).toBe(false)
    expect(run({ ...capable, saveData: true }).loading()).toBe(false)
    expect(run({ ...capable, webgl2: false }).loading()).toBe(false)
    expect(run({ ...capable, cores: minCores - 1 }).loading()).toBe(false)
    expect(run({ ...capable, deviceMemory: minMemoryGb / 2 }).loading()).toBe(false)
  })

  it('decides as the Helix does, for every device', () => {
    for (const reducedMotion of [false, true])
      for (const saveData of [false, true])
        for (const webgl2 of [false, true])
          for (const deviceMemory of [undefined, minMemoryGb / 2, minMemoryGb])
            for (const cores of [undefined, minCores - 1, minCores]) {
              const device = { reducedMotion, saveData, webgl2, deviceMemory, cores }
              const helix = chooseHomeMode({ ...device, featuredCount: 1 }) === 'helix'
              expect(run(device).loading(), JSON.stringify(device)).toBe(helix)
            }
  })

  it('never traps the visitor: the page shows after the timeout whatever the Helix does', () => {
    vi.useFakeTimers()
    const page = run(capable)
    vi.advanceTimersByTime(LOADER_TIMEOUT_MS - 1)
    expect(page.loading()).toBe(true)
    vi.advanceTimersByTime(1)
    expect(page.loading()).toBe(false)
  })
})
