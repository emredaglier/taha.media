// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { deviceReport, isWeakDevice, WEAK_DEVICE } from '../lib/weak-device'
import { setDevice } from './device'

const { minCores, minMemoryGb } = WEAK_DEVICE

describe('the pinned device', () => {
  it('is capable in a test with no setup of its own, whatever the host reports', () => {
    expect(navigator.hardwareConcurrency).toBeGreaterThanOrEqual(minCores)
    expect(navigator.hardwareConcurrency).toBe(minCores * 2)
    expect((navigator as Navigator & { deviceMemory?: number }).deviceMemory).toBe(minMemoryGb * 2)
    expect(isWeakDevice(deviceReport())).toBe(false)
  })
})

describe('setDevice', () => {
  it('overrides the cores and the memory', () => {
    setDevice({ cores: minCores - 1, memory: minMemoryGb / 2 })
    expect(navigator.hardwareConcurrency).toBe(minCores - 1)
    expect(deviceReport().deviceMemory).toBe(minMemoryGb / 2)
    expect(isWeakDevice(deviceReport())).toBe(true)
  })

  it('does not leak into the next test', () => {
    expect(navigator.hardwareConcurrency).toBe(minCores * 2)
    expect(deviceReport().deviceMemory).toBe(minMemoryGb * 2)
    expect(isWeakDevice(deviceReport())).toBe(false)
  })

  it('keeps the pinned value of what it is not given', () => {
    setDevice({ cores: minCores - 1 })
    expect(deviceReport().deviceMemory).toBe(minMemoryGb * 2)
  })

  it('reports no memory when told memory is undefined, as Safari and Firefox do', () => {
    setDevice({ memory: undefined })
    expect(deviceReport().deviceMemory).toBeUndefined()
    expect(deviceReport().cores).toBe(minCores * 2)
  })

  it('does not leak a missing memory into the next test', () => {
    expect(deviceReport().deviceMemory).toBe(minMemoryGb * 2)
  })
})
