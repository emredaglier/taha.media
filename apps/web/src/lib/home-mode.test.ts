import { describe, expect, it } from 'vitest'

import { HELIX_TUNING } from './helix-tuning'
import { chooseHomeMode } from './home-mode'

const { minMemoryGb, minCores } = HELIX_TUNING.weakDevice

/** A capable device with Featured Works: every input clear. */
const capable = {
  reducedMotion: false,
  saveData: false,
  webgl2: true,
  deviceMemory: minMemoryGb * 2,
  cores: minCores * 2,
  featuredCount: 6,
}

describe('chooseHomeMode', () => {
  it('gives the Helix when every check is clear', () => {
    expect(chooseHomeMode(capable)).toBe('helix')
  })

  it.each([
    ['reduced motion', { reducedMotion: true }],
    ['Save-Data', { saveData: true }],
    ['no WebGL2', { webgl2: false }],
    ['too little memory', { deviceMemory: minMemoryGb / 2 }],
    ['too few CPU cores', { cores: minCores - 1 }],
    ['0 Featured Works', { featuredCount: 0 }],
  ])('gives the static Home with %s alone', (_, disqualifier) => {
    expect(chooseHomeMode({ ...capable, ...disqualifier })).toBe('static')
  })

  it('passes a device that reports neither memory nor cores', () => {
    expect(chooseHomeMode({ ...capable, deviceMemory: undefined, cores: undefined })).toBe('helix')
  })

  it('passes a device at exactly the memory and core thresholds', () => {
    expect(chooseHomeMode({ ...capable, deviceMemory: minMemoryGb, cores: minCores })).toBe('helix')
  })

  it('gives the Helix with a single Featured Work', () => {
    expect(chooseHomeMode({ ...capable, featuredCount: 1 })).toBe('helix')
  })
})
