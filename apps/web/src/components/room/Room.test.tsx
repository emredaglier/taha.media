// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { LOADING_CLASS } from '../../lib/home-loader'
import type { HelixWork } from '../FeaturedWorks'
import { Room } from './Room'
import { RoomUnavailable, type RoomRenderer } from './renderer'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has no WebGL: the renderer is a stand-in that records what the room asks of it.
const renderer = vi.hoisted(() => ({
  create: vi.fn(),
}))
vi.mock('./renderer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./renderer')>()),
  createRoomRenderer: renderer.create,
}))

const works = [{ slug: 'a' }] as HelixWork[]

type Frame = { progress: number; pointer: { nx: number; ny: number; dx: number } | null }
let draws: Frame[]
let loss: (() => void) | null
let destroy: Mock<() => void>

/** A manual animation-frame queue, and a clock that moves 16 ms a frame. */
let queue: Map<number, FrameRequestCallback>
let nextId: number
let clock: number
const runFrame = () => {
  const [id, callback] = [...queue][0] ?? []
  if (id === undefined || !callback) return false
  queue.delete(id)
  clock += 16
  act(() => callback(clock))
  return true
}
const runFrames = (count: number) => {
  for (let i = 0; i < count; i++) runFrame()
}

let container: HTMLElement
let root: Root
let failed: Mock<() => void>

const mount = async () => {
  await act(async () => root.render(<Room works={works} onFail={failed} />))
  await act(async () => {}) // the stills' promise
}
const canvas = () => container.querySelector('canvas')!

beforeEach(() => {
  draws = []
  loss = null
  destroy = vi.fn()
  failed = vi.fn()
  queue = new Map()
  nextId = 1
  clock = 0
  const fake: RoomRenderer = {
    ready: Promise.resolve(),
    draw: (frame) => draws.push({ progress: frame.progress, pointer: frame.pointer }),
    resize: vi.fn(),
    destroy,
  }
  renderer.create.mockImplementation((_canvas, _works, _touch, onFail: () => void) => {
    loss = onFail
    return fake
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queue.set(nextId, callback)
    return nextId++
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  window.scrollTo = vi.fn()
  document.documentElement.classList.add(LOADING_CLASS)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.documentElement.classList.remove(LOADING_CLASS)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
})

describe('the Edit Room on Home', () => {
  it('draws nothing and keeps the loader until it has a first frame, then takes it off', async () => {
    await mount()
    expect(draws).toHaveLength(0)
    expect(document.documentElement.classList.contains(LOADING_CLASS)).toBe(true)
    expect(document.documentElement.dataset.home).toBeUndefined()

    runFrame()

    expect(draws).toHaveLength(1)
    expect(document.documentElement.classList.contains(LOADING_CLASS)).toBe(false)
    expect(document.documentElement.dataset.home).toBe('room')
  })

  it('gives the static Home back, and the loader off, when WebGL2 cannot start', async () => {
    renderer.create.mockImplementation(() => {
      throw new RoomUnavailable('No WebGL2')
    })
    await mount()
    expect(failed).toHaveBeenCalledTimes(1)
    expect(document.documentElement.classList.contains(LOADING_CLASS)).toBe(false)
  })

  it('gives the static Home back when the renderer reports a lost context or a bad shader', async () => {
    await mount()
    runFrame()
    loss!()
    expect(failed).toHaveBeenCalledTimes(1)
    expect(document.documentElement.classList.contains(LOADING_CLASS)).toBe(false)
  })

  it('stops drawing while the tab is hidden and goes on when it is back', async () => {
    await mount()
    runFrames(2)
    expect(draws).toHaveLength(2)

    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(runFrame()).toBe(false)
    expect(draws).toHaveLength(2)

    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    runFrame()
    expect(draws).toHaveLength(3)
  })

  it('moves along the path on the wheel and never lets the page scroll', async () => {
    await mount()
    runFrame()
    const wheel = new WheelEvent('wheel', { deltaY: 400, cancelable: true })
    window.dispatchEvent(wheel)
    expect(wheel.defaultPrevented).toBe(true)
    runFrames(30)
    const progress = draws.at(-1)!.progress
    expect(progress).toBeGreaterThan(0)
    expect(progress).toBeLessThanOrEqual(1)
  })

  it('leaves ctrl + wheel to the browser', async () => {
    await mount()
    const zoom = new WheelEvent('wheel', { deltaY: 400, ctrlKey: true, cancelable: true })
    window.dispatchEvent(zoom)
    expect(zoom.defaultPrevented).toBe(false)
  })

  it('moves along the path on a vertical drag, further in as the pointer goes up', async () => {
    await mount()
    runFrame()
    // jsdom has no PointerEvent: a mouse event with the fields the room reads stands in.
    const asPointer = (event: Event) => Object.assign(event, { pointerId: 1, isPrimary: true })
    canvas().setPointerCapture = vi.fn()
    canvas().dispatchEvent(
      asPointer(new MouseEvent('pointerdown', { clientX: 100, clientY: 600, button: 0 })),
    )
    canvas().dispatchEvent(asPointer(new MouseEvent('pointermove', { clientX: 100, clientY: 200 })))
    runFrames(30)
    expect(draws.at(-1)!.progress).toBeGreaterThan(0)

    canvas().dispatchEvent(asPointer(new MouseEvent('pointerup', { clientX: 100, clientY: 200 })))
    canvas().dispatchEvent(asPointer(new MouseEvent('pointermove', { clientX: 100, clientY: 600 })))
    const settled = draws.at(-1)!.progress
    runFrames(30)
    expect(draws.at(-1)!.progress).toBeCloseTo(settled, 1) // a move with no press doesn't drag
  })

  it('takes the marks and the stand-in down again when it unmounts', async () => {
    await mount()
    runFrame()
    act(() => root.unmount())
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(document.documentElement.dataset.home).toBeUndefined()
    expect(document.documentElement.dataset.helixPhase).toBeUndefined()
    root = createRoot(container) // for the afterEach
  })
})
