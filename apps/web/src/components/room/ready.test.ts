import { afterEach, describe, expect, it, vi } from 'vitest'

import { LOADER_TIMEOUT_MS } from '../../lib/home-loader'
import { ROOM_TUNING } from '../../lib/room-tuning'
import { readyWithin } from './ready'

afterEach(() => vi.useRealTimers())

const settled = async (promise: Promise<unknown>) => {
  let done = false
  void promise.then(() => (done = true))
  await vi.advanceTimersByTimeAsync(0)
  return done
}

describe('what the room waits for before its first frame', () => {
  it('waits for every part, the Showreel and the Statement among them', async () => {
    vi.useFakeTimers()
    let showreel!: () => void
    const parts = [
      Promise.resolve(), // the Statement
      new Promise<void>((resolve) => (showreel = resolve)),
      undefined, // no Showreel on a room that opens at rest
    ]
    const ready = readyWithin(parts, ROOM_TUNING.stillsWaitMs)
    expect(await settled(ready)).toBe(false)
    showreel()
    expect(await settled(ready)).toBe(true)
  })

  it('gives up on a part that hangs, before the loader hits its own 4 s cap', async () => {
    vi.useFakeTimers()
    expect(ROOM_TUNING.stillsWaitMs).toBeLessThan(LOADER_TIMEOUT_MS)
    expect(LOADER_TIMEOUT_MS).toBe(4000)
    const ready = readyWithin([new Promise(() => {})], ROOM_TUNING.stillsWaitMs)
    await vi.advanceTimersByTimeAsync(ROOM_TUNING.stillsWaitMs - 1)
    expect(await settled(ready)).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await settled(ready)).toBe(true)
  })

  it('leaves no timer behind once everything is in', async () => {
    vi.useFakeTimers()
    await readyWithin([Promise.resolve()], ROOM_TUNING.stillsWaitMs)
    expect(vi.getTimerCount()).toBe(0)
  })
})
