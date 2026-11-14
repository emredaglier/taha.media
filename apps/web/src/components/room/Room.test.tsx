// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { LOADING_CLASS } from '../../lib/home-loader'
import { stopForPlace } from '../../lib/room-model'
import { OPENING_SECONDS } from '../../lib/room-opening'
import { rememberWork } from '../../lib/room-start'
import type { RoomWork } from '../FeaturedWorks'
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

// The router is a stand-in too: the room only asks it to open a Work's page.
const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

const works = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }] as RoomWork[]
const showreel = { src: 'https://cdn.example/reel.mp4' }

// What the stand-in renderer answers: the place under the pointer, the hot one, and the push-in's arrival.
const scene = { pick: vi.fn<(nx: number, ny: number) => number>(), hot: -1, pushed: false }
let pushes: number[]

type Frame = {
  progress: number
  pointer: { nx: number; ny: number; dx: number } | null
  /** The opening as it was when drawn (the room reuses one object). */
  opening: { reel: number; fly: number; settled: boolean }
  focus: number
}
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

const mount = async (light = false) => {
  await act(async () =>
    root.render(<Room works={works} showreel={showreel} light={light} onFail={failed} />),
  )
  await act(async () => {}) // the stills' promise
}
const canvas = () => container.querySelector('canvas')!

beforeEach(() => {
  draws = []
  pushes = []
  scene.pick.mockReset().mockReturnValue(-1)
  scene.hot = -1
  scene.pushed = false
  router.push.mockReset()
  loss = null
  destroy = vi.fn()
  failed = vi.fn()
  queue = new Map()
  nextId = 1
  clock = 0
  const fake: RoomRenderer = {
    ready: Promise.resolve(),
    draw: (frame) => {
      const { reel, fly, settled } = frame.opening
      draws.push({
        progress: frame.progress,
        pointer: frame.pointer,
        opening: { reel, fly, settled },
        focus: frame.focus,
      })
    },
    pick: scene.pick,
    push: (place) => pushes.push(place),
    get hot() {
      return scene.hot
    },
    get pushed() {
      return scene.pushed
    },
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
  delete document.documentElement.dataset.roomOpened
  window.history.replaceState(null, '')
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

  it('gives a second mount a fresh canvas, as the first one lost its context (#138)', async () => {
    // Strict Mode (next dev) mounts, cleans up and mounts again; the cleanup's destroy kills the
    // first canvas's WebGL context for good.
    await act(async () =>
      root.render(
        <StrictMode>
          <Room works={works} showreel={showreel} light={false} onFail={failed} />
        </StrictMode>,
      ),
    )
    const [first, second] = renderer.create.mock.calls.map(([used]) => used as HTMLCanvasElement)
    expect(destroy).toHaveBeenCalledOnce()
    expect(second).not.toBe(first)
    expect(first!.isConnected).toBe(false)
    expect(Array.from(container.querySelectorAll('canvas'))).toEqual([second])
  })

  it('is the light variant (touch) only when told so', async () => {
    await mount(true)
    expect(renderer.create.mock.calls[0]![2]).toBe(true)
    act(() => root.unmount())
    renderer.create.mockClear()
    root = createRoot(container)
    await mount()
    expect(renderer.create.mock.calls[0]![2]).toBe(false)
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

  it('leaves the wheel to the page until the first frame is drawn', async () => {
    await mount()
    const early = new WheelEvent('wheel', { deltaY: 400, cancelable: true })
    window.dispatchEvent(early)
    expect(early.defaultPrevented).toBe(false)
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
    root = createRoot(container) // for the afterEach
  })

  describe('the opening (#131)', () => {
    /** The document was loaded on Home, as the loader's script saw it. */
    const loadedOnHome = () =>
      vi
        .spyOn(performance, 'getEntriesByType')
        .mockReturnValue([{ type: 'navigate', name: 'https://taha.media/' }] as never)
    const pointerDown = () => {
      const event = Object.assign(new MouseEvent('pointerdown', { button: 0 }), {
        pointerId: 1,
        isPrimary: true,
      })
      canvas().setPointerCapture = vi.fn()
      canvas().dispatchEvent(event)
    }

    it('plays on a document loaded on Home: it starts at the middle monitor and reaches rest', async () => {
      loadedOnHome()
      await mount()
      runFrame()
      expect(draws[0]!.opening).toMatchObject({ reel: 1, fly: 1, settled: false })
      expect(renderer.create.mock.calls[0]![4]).toBe(showreel.src)

      runFrames(Math.ceil((OPENING_SECONDS * 1000) / 16) + 10)
      expect(draws.at(-1)!.opening).toMatchObject({ reel: 0, fly: 0, settled: true })
    })

    it("sets the Hero text's variable from the pull-back, 0 at the Showreel and 1 at rest, and removes it on unmount (#141)", async () => {
      loadedOnHome()
      await mount()
      const gone = () => document.documentElement.style.getPropertyValue('--room-hero-gone')
      runFrame()
      expect(gone()).toBe('0')
      runFrames(Math.ceil((OPENING_SECONDS * 1000) / 16) + 10)
      expect(gone()).toBe('1')
      act(() => root.unmount())
      expect(gone()).toBe('')
      root = createRoot(container)
    })

    it('has the Hero text gone from the first frame of a rest start (#141)', async () => {
      await mount()
      runFrame()
      expect(document.documentElement.style.getPropertyValue('--room-hero-gone')).toBe('1')
    })

    it('is skipped by a click or tap, which lands on rest and picks no Work itself', async () => {
      loadedOnHome()
      await mount()
      runFrames(5)
      expect(draws.at(-1)!.opening.settled).toBe(false)
      pointerDown()
      runFrame()
      expect(draws.at(-1)!.opening).toMatchObject({ reel: 0, fly: 0, settled: true })
    })

    it('lets a Work be chosen right after a skip, and a click during the opening chooses nothing', async () => {
      loadedOnHome()
      scene.pick.mockReturnValue(1)
      await mount()
      runFrames(5)
      pointerDown()
      canvas().dispatchEvent(
        Object.assign(new MouseEvent('pointerup', { button: 0 }), {
          pointerId: 1,
          isPrimary: true,
        }),
      )
      expect(pushes).toEqual([]) // that click only skipped
      runFrame()
      pointerDown()
      canvas().dispatchEvent(
        Object.assign(new MouseEvent('pointerup', { button: 0 }), {
          pointerId: 1,
          isPrimary: true,
        }),
      )
      expect(pushes).toEqual([1]) // the next one chooses
    })

    it('remembers the Work it opens, so the way back rests at its stop', async () => {
      await mount()
      runFrame()
      scene.pick.mockReturnValue(1)
      canvas().setPointerCapture = vi.fn()
      for (const type of ['pointerdown', 'pointerup'])
        canvas().dispatchEvent(
          Object.assign(new MouseEvent(type, { button: 0 }), { pointerId: 1, isPrimary: true }),
        )
      scene.pushed = true
      runFrames(2)
      expect(router.push).toHaveBeenCalledWith('/isler/b')
      expect(window.history.state).toMatchObject({ roomWork: 'b' })
    })

    it('does not play on client navigation to Home: rest from the first frame, no Showreel loaded', async () => {
      await mount() // no document load on Home: the page was reached by a client navigation
      runFrame()
      expect(draws[0]!.opening.settled).toBe(true)
      expect(renderer.create.mock.calls[0]![4]).toBeNull()
    })

    it('does not play a second time in the same document', async () => {
      loadedOnHome()
      await mount()
      runFrame()
      act(() => root.unmount())
      root = createRoot(container)
      draws.length = 0
      await mount()
      runFrame()
      expect(draws[0]!.opening.settled).toBe(true)
    })

    it("does not play coming back from a Work page, and rests at that Work's stop", async () => {
      loadedOnHome()
      rememberWork('c')
      await mount()
      runFrame()
      expect(draws[0]!.opening.settled).toBe(true)
      expect(draws[0]!.progress).toBeCloseTo(stopForPlace(2, false).progress, 5)
      expect(renderer.create.mock.calls[0]![4]).toBeNull()
    })

    it('remembers the Work whose link is followed, for the way back', async () => {
      await mount()
      runFrame()
      const link = document.createElement('a')
      link.href = '/isler/b'
      link.setAttribute('data-work-slug', 'b')
      link.addEventListener('click', (event) => event.preventDefault())
      document.body.append(link)
      link.click()
      link.remove()
      expect(window.history.state).toMatchObject({ roomWork: 'b' })
    })

    it('keeps the loader until the room has what it waits for', async () => {
      let ready!: () => void
      const waiting = new Promise<void>((resolve) => (ready = resolve))
      const base = renderer.create.getMockImplementation()!
      renderer.create.mockImplementation((...args: unknown[]) => ({
        ...base(...args),
        ready: waiting,
      }))
      await mount()
      expect(runFrame()).toBe(false)
      expect(document.documentElement.classList.contains(LOADING_CLASS)).toBe(true)
      await act(async () => ready())
      runFrame()
      expect(document.documentElement.classList.contains(LOADING_CLASS)).toBe(false)
    })
  })

  describe('pointing', () => {
    // jsdom has no PointerEvent: a mouse event with the fields the room reads stands in.
    const asPointer = (event: Event) => Object.assign(event, { pointerId: 1, isPrimary: true })
    const press = (type: string, x: number, y: number) =>
      canvas().dispatchEvent(asPointer(new MouseEvent(type, { clientX: x, clientY: y, button: 0 })))
    const click = (x: number, y: number) => {
      press('pointerdown', x, y)
      press('pointerup', x, y)
    }

    beforeEach(async () => {
      await mount()
      canvas().setPointerCapture = vi.fn()
      runFrame()
    })

    it('swells the Drop cursor over a Work and lets go when the pointer leaves it', () => {
      scene.hot = 1
      runFrame()
      expect(canvas().dataset.cursor).toBe('Aç')
      scene.hot = -1
      runFrame()
      expect(canvas().dataset.cursor).toBeUndefined()
    })

    it('pushes into the Work under a click, and opens its page once the camera has arrived', () => {
      scene.pick.mockReturnValue(1)
      click(300, 200)
      expect(pushes).toEqual([1])
      runFrames(3)
      expect(router.push).not.toHaveBeenCalled()
      scene.pushed = true
      runFrames(3)
      expect(router.push).toHaveBeenCalledTimes(1)
      expect(router.push).toHaveBeenCalledWith('/isler/b')
    })

    it('does nothing for a click on no screen', () => {
      click(300, 200)
      expect(pushes).toEqual([])
    })

    it('takes a drag for no click, and a slip of the hand for a click', () => {
      scene.pick.mockReturnValue(0)
      press('pointerdown', 300, 600)
      press('pointermove', 300, 200)
      press('pointerup', 300, 200)
      expect(pushes).toEqual([])
      press('pointerdown', 300, 200)
      press('pointermove', 302, 203)
      press('pointerup', 302, 203)
      expect(pushes).toEqual([0])
    })

    it('holds the camera and the cursor still once pushing: no wheel, no second push', () => {
      scene.pick.mockReturnValue(0)
      click(300, 200)
      scene.hot = 0
      runFrame()
      expect(canvas().dataset.cursor).toBeUndefined()
      const wheel = new WheelEvent('wheel', { deltaY: 400, cancelable: true })
      window.dispatchEvent(wheel)
      expect(wheel.defaultPrevented).toBe(true)
      runFrames(30)
      expect(draws.at(-1)!.progress).toBe(0)
      click(300, 200)
      expect(pushes).toEqual([0])
    })

    it('starts no second push and opens no other page while the Work page loads', () => {
      scene.pick.mockReturnValue(1)
      click(300, 200)
      scene.pushed = true
      runFrames(3)
      scene.pick.mockReturnValue(0)
      click(300, 200)
      runFrames(3)
      expect(pushes).toEqual([1])
      expect(router.push).toHaveBeenCalledTimes(1)
      expect(router.push).toHaveBeenCalledWith('/isler/b')
    })
  })

  describe('the keyboard (#132)', () => {
    let links: HTMLAnchorElement[]
    // The static Home's links, which stay in the page under the room.
    afterEach(() => links.forEach((link) => link.remove()))
    beforeEach(async () => {
      vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
        { type: 'navigate', name: 'https://taha.media/' },
      ] as never) // a document loaded on Home: the opening plays
      links = works.map(({ slug }) => {
        const link = document.createElement('a')
        link.href = `/isler/${slug}`
        link.setAttribute('data-work-slug', slug)
        document.body.append(link)
        return link
      })
      await mount()
      runFrame()
    })

    it('makes the Work of a focused link hot and brings its stop into view, until focus leaves', () => {
      links[2]!.focus()
      runFrames(240)
      expect(draws.at(-1)!.focus).toBe(2)
      expect(draws.at(-1)!.progress).toBeCloseTo(stopForPlace(2, false).progress, 2)
      links[2]!.blur()
      runFrame()
      expect(draws.at(-1)!.focus).toBe(-1)
    })

    it('plays the push-in on Enter, without following the link, then opens the Work page', () => {
      links[1]!.focus()
      const enter = new MouseEvent('click', { bubbles: true, cancelable: true })
      links[1]!.dispatchEvent(enter)
      expect(enter.defaultPrevented).toBe(true)
      expect(pushes).toEqual([1])
      links[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      expect(pushes).toEqual([1])
      scene.pushed = true
      runFrames(3)
      expect(router.push).toHaveBeenCalledTimes(1)
      expect(router.push).toHaveBeenCalledWith('/isler/b')
    })

    it('leaves a modified click, which opens a new tab, to the browser', () => {
      const click = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
      let prevented = true
      links[0]!.addEventListener('click', (event) => {
        prevented = event.defaultPrevented
        event.preventDefault() // jsdom cannot navigate
      })
      links[0]!.dispatchEvent(click)
      expect(prevented).toBe(false)
      expect(pushes).toEqual([])
    })

    it('skips the opening, as a click would', () => {
      expect(draws[0]!.opening.settled).toBe(false)
      links[0]!.focus()
      runFrame()
      expect(draws.at(-1)!.opening.settled).toBe(true)
    })
  })
})
