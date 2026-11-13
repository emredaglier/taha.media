// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tracker = vi.hoisted(() => ({
  createHandTracker: vi.fn(),
  close: vi.fn(),
}))
vi.mock('./tracker', () => ({ createHandTracker: tracker.createHandTracker }))

import { CHIN_GAP, hold, pose } from '../../lib/hand-fixtures'
import type { HandFrame } from '../../lib/hand-gesture'
import { HAND_TUNING } from '../../lib/hand-tuning'
import { WEAK_DEVICE } from '../../lib/weak-device'
import { lockScroll } from '../../lib/menu-a11y'
import { HINT_TEXT } from '../../lib/hand-hints'
import { HAND_ON_KEY, markCoachSeen } from '../../lib/hand-session'
import { MENU_PANEL_ID } from '../../lib/menu-a11y'
import { setDevice } from '../../test/device'
import { CONSENT_TEXT, CONSENT_TITLE } from './ConsentNote'
import { claimHandGrab } from './grab'
import { COACH_STEPS } from './HandCoach'
import { HandControl } from './HandControl'
import { HandToggle } from './HandToggle'
import { dispatchHand } from './store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/*
 * The toggle (in the header) and the controller (in the root layout) together, against a fake
 * camera: the risky paths are that nothing asks for the camera or loads the tracking files before
 * Aç, and that every way off stops every camera track.
 */

let container: HTMLElement
let root: Root
let hidden = false
let cameras: { kind: string }[]
let track: EventTarget & { stop: ReturnType<typeof vi.fn> }
let getUserMedia: ReturnType<typeof vi.fn>
/**
 * The callbacks waiting for the next page frame (`requestAnimationFrame`) and the next camera frame
 * (`requestVideoFrameCallback`), by handle, and the two clocks (s), which run together.
 */
let frames: Map<number, (now: number) => void>
let videoFrames: Map<number, (now: number) => void>
let nextHandle: number
let videoTime: number
let pageTime: number
/** The points the hand's hit test asked about. */
let hits: [number, number][]

const { minCores } = WEAK_DEVICE

/** How the browser says this page was loaded (`PerformanceNavigationTiming.type`). */
let navigationType: string

/** What the tracker reports for `hand`: found surely, or nothing. */
const sighting = (hand: HandFrame | null, score = 0.95) => (hand ? { hand, score } : null)

/** A camera stream with one video track. */
const stream = () => ({ getTracks: () => [track], getVideoTracks: () => [track] })

/**
 * The camera's frame interval (s), the page's (s), and whether the visitor prefers reduced motion.
 */
let frameSeconds: number
let pageSeconds: number
let reducedMotion: boolean

/** Runs every callback waiting in `queue` at `seconds`. */
const due = (queue: Map<number, (now: number) => void>, seconds: number) => {
  const waiting = [...queue.values()]
  queue.clear()
  for (const callback of waiting) callback(seconds * 1000)
}

/**
 * Runs `count` camera frames through the controller's tracking loop, with the page's frames that
 * fall between them (at `pageSeconds`).
 */
const runFrames = (count: number) =>
  act(() => {
    for (let i = 0; i < count; i++) {
      const next = videoTime + frameSeconds
      while (pageTime + pageSeconds <= next + 1e-9) {
        pageTime += pageSeconds
        due(frames, pageTime)
      }
      videoTime = next
      due(videoFrames, videoTime)
    }
  })

/** Runs camera frames for `ms`. */
const runFor = (ms: number) => runFrames(Math.round(ms / (frameSeconds * 1000)))

const DESKTOP_QUERIES = ['(pointer: fine)', '(hover: hover)', '(hover: hover) and (pointer: fine)']

/** Lets pending promises (the camera, the tracker, the device list) settle. */
const settle = () => act(async () => {})

const render = async () => {
  await act(() =>
    root.render(
      <>
        <HandToggle />
        <HandControl />
      </>,
    ),
  )
  await settle()
}

const toggle = () => container.querySelector<HTMLButtonElement>('button[aria-pressed]')
const note = () => container.querySelector('[role="dialog"]')
const button = (label: string) =>
  [...container.querySelectorAll('button')].find(
    (b) => b.textContent === label || b.getAttribute('aria-label') === label,
  )
const status = () => container.querySelector('[role="status"]')!.textContent
const click = (element: HTMLElement | undefined | null) => act(() => element!.click())
const press = (key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
    )
  })

/** Toggle, Aç, the camera answers and the tracker loads: Hand control is on. */
const turnOn = async () => {
  await click(toggle())
  await click(button('Aç'))
  await settle()
}

beforeEach(() => {
  hidden = false
  cameras = [{ kind: 'videoinput' }]
  track = Object.assign(new EventTarget(), { stop: vi.fn() })
  getUserMedia = vi.fn(async () => stream())
  frames = new Map()
  videoFrames = new Map()
  nextHandle = 1
  videoTime = 0
  pageTime = 0
  frameSeconds = 1 / 30
  pageSeconds = 1 / 60
  reducedMotion = false
  hits = []
  localStorage.clear()
  sessionStorage.clear()
  const waitFor =
    (queue: () => Map<number, (now: number) => void>) => (callback: (now: number) => void) => {
      const handle = nextHandle++
      queue().set(handle, callback)
      return handle
    }
  vi.stubGlobal(
    'requestAnimationFrame',
    waitFor(() => frames),
  )
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => frames.delete(handle))
  Object.assign(HTMLVideoElement.prototype, {
    requestVideoFrameCallback: waitFor(() => videoFrames),
    cancelVideoFrameCallback: (handle: number) => videoFrames.delete(handle),
  })
  // A tab that has never had Hand control on, in a browser without the Permissions API (jsdom),
  // on a page reached by a plain navigation.
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined })
  navigationType = 'navigate'
  Object.defineProperty(performance, 'getEntriesByType', {
    configurable: true,
    value: (type: string) => (type === 'navigation' ? [{ type: navigationType }] : []),
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
    configurable: true,
    get: () => 4,
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get: () => videoTime,
    set: () => {},
  })
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: 1000,
  })
  Object.defineProperty(document.documentElement, 'clientHeight', {
    configurable: true,
    value: 800,
  })
  document.elementsFromPoint = (x: number, y: number) => {
    hits.push([x, y])
    return []
  }
  tracker.close.mockReset()
  tracker.createHandTracker.mockReset()
  tracker.createHandTracker.mockImplementation(async () => ({
    detect: () => null,
    close: tracker.close,
  }))
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches:
          DESKTOP_QUERIES.includes(query) ||
          (reducedMotion && query === '(prefers-reduced-motion: reduce)'),
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: async () => cameras,
      getUserMedia,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  })
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  HTMLMediaElement.prototype.play = vi.fn(async () => {})
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  delete (navigator as { permissions?: unknown }).permissions
  delete (performance as { getEntriesByType?: unknown }).getEntriesByType
  delete (document as { wasDiscarded?: boolean }).wasDiscarded
  const video = HTMLVideoElement.prototype as unknown as Partial<Record<string, unknown>>
  delete video.requestVideoFrameCallback
  delete video.cancelVideoFrameCallback
  await act(() => root.unmount())
  container.remove()
  dispatchHand({ kind: 'dismissNotice' })
  vi.unstubAllGlobals()
})

describe('the toggle', () => {
  const slot = () => container.querySelector<HTMLElement>('[data-hand-toggle-slot]')
  const placeholder = () => slot()!.querySelector<HTMLElement>('[aria-hidden="true"]')

  it('server-renders only its reserved slot: shown on a desktop pointer by CSS, no button', () => {
    const html = document.createElement('div')
    html.innerHTML = renderToString(<HandToggle />)
    const reserved = html.querySelector<HTMLElement>('[data-hand-toggle-slot]')!
    expect(reserved.className).toMatch(/(^| )hidden( |$)/)
    expect(reserved.className).toContain('fine-hover:block')
    expect(html.querySelector('button')).toBeNull()
    // The slot holds the label invisibly, so it is the button's size, and hides it from everyone.
    const label = reserved.querySelector<HTMLElement>('[aria-hidden="true"]')!
    expect(label.textContent).toBe('Elinle gez')
    expect(label.className).toContain('invisible')
    expect(label.matches('a, button, input, [tabindex]')).toBe(false)
  })

  it('shows on a desktop with a camera, as an unpressed toggle button over its slot', async () => {
    await render()
    expect(toggle()!.textContent).toBe('Elinle gez')
    expect(toggle()!.getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('[role="status"]')!.getAttribute('aria-live')).toBe('polite')
    // Same slot, same placeholder sizing it; the button lies over it and adds no box of its own.
    expect(toggle()!.parentElement).toBe(slot())
    expect(placeholder()!.textContent).toBe(toggle()!.textContent)
    expect(placeholder()!.className.replace('invisible', '').trim().split(/\s+/)).toEqual(
      expect.arrayContaining(['font-serif', 'text-xl', 'uppercase', 'whitespace-nowrap']),
    )
    expect(toggle()!.className.split(/\s+/)).toEqual(
      expect.arrayContaining([
        'absolute',
        'inset-0',
        'font-serif',
        'text-xl',
        'uppercase',
        'whitespace-nowrap',
      ]),
    )
  })

  it('keeps the slot, with the same placeholder, when the button arrives', async () => {
    const html = renderToString(<HandToggle />)
    await render()
    const before = document.createElement('div')
    before.innerHTML = html
    const serverSlot = before.querySelector<HTMLElement>('[data-hand-toggle-slot]')!
    expect(slot()!.className).toBe(serverSlot.className)
    expect(placeholder()!.outerHTML).toBe(serverSlot.firstElementChild!.outerHTML)
  })

  it('is not offered on a weak device: the slot stays an empty gap', async () => {
    setDevice({ cores: minCores - 1 })
    await render()
    expect(toggle()).toBeNull()
    expect(slot()).not.toBeNull()
    expect(slot()!.querySelector('button, [role="status"]')).toBeNull()
  })

  it('is not offered without a camera: the slot stays an empty gap', async () => {
    cameras = [{ kind: 'audioinput' }]
    await render()
    expect(toggle()).toBeNull()
    expect(slot()).not.toBeNull()
    expect(slot()!.querySelector('button, [role="status"]')).toBeNull()
  })
})

describe('the consent note', () => {
  it('opens on the first press with the decided text, and asks for nothing yet', async () => {
    await render()
    await click(toggle())
    expect(note()!.textContent).toContain(CONSENT_TEXT)
    expect(note()!.getAttribute('aria-modal')).toBe('true')
    expect(note()!.contains(document.activeElement)).toBe(true)
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(tracker.createHandTracker).not.toHaveBeenCalled()
  })

  it('keeps Tab and Shift+Tab inside, step by step (Safari skips buttons)', async () => {
    await render()
    await click(toggle())
    const [first, second] = [button('Vazgeç')!, button('Aç')!]
    expect(document.activeElement).toBe(first)
    await press('Tab')
    expect(document.activeElement).toBe(second)
    await press('Tab')
    expect(document.activeElement).toBe(first)
    await press('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(second)
  })

  it.each([
    ['Vazgeç', () => click(button('Vazgeç'))],
    ['Esc', () => press('Escape')],
  ])('%s closes it, stays off, says so and gives focus back to the toggle', async (_, close) => {
    await render()
    await click(toggle())
    await close()
    expect(note()).toBeNull()
    expect(document.activeElement).toBe(toggle())
    expect(toggle()!.getAttribute('aria-pressed')).toBe('false')
    expect(status()).not.toBe('')
    expect(getUserMedia).not.toHaveBeenCalled()
  })
})

describe('turning on', () => {
  it('only Aç asks for the camera, and only then load the tracking files', async () => {
    await render()
    await click(toggle())
    expect(getUserMedia).not.toHaveBeenCalled()
    await click(button('Aç'))
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(getUserMedia.mock.calls[0]![0]).toMatchObject({ audio: false })
    await settle()
    expect(tracker.createHandTracker).toHaveBeenCalledTimes(1)
    expect(toggle()!.getAttribute('aria-pressed')).toBe('true')
    expect(button('Elinle gezmeyi kapat')).toBeDefined() // the preview, with its ×
  })

  it('a refused prompt stays off, says so and loads nothing', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'))
    await render()
    await turnOn()
    expect(toggle()!.getAttribute('aria-pressed')).toBe('false')
    expect(status()).not.toBe('')
    expect(tracker.createHandTracker).not.toHaveBeenCalled()
    expect(button('Elinle gezmeyi kapat')).toBeUndefined()
  })
})

describe('turning off stops every camera track and closes the tracker', () => {
  it.each([
    ['the toggle', () => click(toggle())],
    ['the ×', () => click(button('Elinle gezmeyi kapat'))],
    [
      'a hidden tab',
      () =>
        act(() => {
          hidden = true
          document.dispatchEvent(new Event('visibilitychange'))
        }),
    ],
    ['unmounting', () => act(() => root.unmount())],
  ])('%s', async (_, turnOff) => {
    await render()
    await turnOn()
    expect(track.stop).not.toHaveBeenCalled()
    await turnOff()
    expect(track.stop).toHaveBeenCalled()
    expect(tracker.close).toHaveBeenCalled()
    expect(button('Elinle gezmeyi kapat')).toBeUndefined()
  })

  it('a camera that answers after Hand control was turned off is stopped at once', async () => {
    let grant: (stream: unknown) => void = () => {}
    getUserMedia.mockImplementationOnce(() => new Promise((resolve) => (grant = resolve)))
    await render()
    await click(toggle())
    await click(button('Aç'))
    await click(toggle()) // off while the browser still asks
    await act(async () => grant(stream()))
    expect(track.stop).toHaveBeenCalled()
    expect(tracker.createHandTracker).not.toHaveBeenCalled()
  })

  it('a tracker that loads after Hand control was turned off is closed', async () => {
    let ready: (value: unknown) => void = () => {}
    tracker.createHandTracker.mockImplementationOnce(() => new Promise((r) => (ready = r)))
    await render()
    await turnOn()
    await click(toggle())
    expect(track.stop).toHaveBeenCalled()
    await act(async () => ready({ detect: () => null, close: tracker.close }))
    expect(tracker.close).toHaveBeenCalled()
  })
})

describe('the consent note for the pointer', () => {
  const pointerDown = (target: Element) =>
    act(() => {
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })

  it('is named by a short title and described by the sentence', async () => {
    await render()
    await click(toggle())
    const title = document.getElementById(note()!.getAttribute('aria-labelledby')!)
    const description = document.getElementById(note()!.getAttribute('aria-describedby')!)
    expect(title!.textContent).toBe(CONSENT_TITLE)
    expect(description!.textContent).toBe(CONSENT_TEXT)
  })

  it('a press outside it is Vazgeç', async () => {
    await render()
    await click(toggle())
    await pointerDown(document.body)
    expect(note()).toBeNull()
    expect(status()).not.toBe('')
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('a press inside it, or on the toggle, is not', async () => {
    await render()
    await click(toggle())
    await pointerDown(note()!.querySelector('p')!)
    await pointerDown(toggle()!)
    expect(note()).not.toBeNull()
  })
})

describe('while on', () => {
  /** A tracker whose `detect` is `detect`. */
  const trackerWith = (detect: () => unknown) =>
    tracker.createHandTracker.mockImplementation(async () => ({ detect, close: tracker.close }))

  it(`a tracker failing ${HAND_TUNING.maxFailedFrames} frames in a row turns it off, logging once`, async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    trackerWith(() => {
      throw new Error('graph failed')
    })
    await render()
    await turnOn()
    await runFrames(HAND_TUNING.maxFailedFrames - 1)
    expect(toggle()!.getAttribute('aria-pressed')).toBe('true')
    await runFrames(1)
    expect(toggle()!.getAttribute('aria-pressed')).toBe('false')
    expect(track.stop).toHaveBeenCalled()
    expect(tracker.close).toHaveBeenCalled()
    expect(status()).not.toBe('')
    // Our log, once (jsdom adds its own "not implemented" canvas notices).
    const ours = error.mock.calls.filter(([message]) => String(message).startsWith('Hand control'))
    expect(ours).toHaveLength(1)
    error.mockRestore()
  })

  it('a camera that ends on its own (unplugged, permission revoked) turns it off and says so', async () => {
    await render()
    await turnOn()
    await act(() => {
      track.dispatchEvent(new Event('ended'))
    })
    expect(toggle()!.getAttribute('aria-pressed')).toBe('false')
    expect(button('Elinle gezmeyi kapat')).toBeUndefined()
    expect(tracker.close).toHaveBeenCalled()
    expect(status()).not.toBe('')
  })

  it('the cursor at the far edge hits the last pixel, not past it (MENU sits there)', async () => {
    // The camera's left edge is the screen's right edge (mirrored); its bottom is the bottom.
    const corner = Array.from({ length: 21 }, () => ({ x: 0, y: 1 }))
    trackerWith(() => sighting(corner))
    await render()
    await turnOn()
    await runFrames(1)
    expect(hits.at(-1)).toEqual([999, 799])
  })
})

describe('pinching (#57)', () => {
  const { pinch, click: quick } = HAND_TUNING
  const OPEN = 0.9
  const CLOSED = OPEN * pinch.calibrationShare * 0.5
  /** Camera frames in `ms` at the camera's current frame rate. */
  const framesIn = (ms: number) => Math.max(1, Math.round(ms / (frameSeconds * 1000)))
  /** The camera shows `frames` one per camera frame, then keeps showing the last. */
  let queue: HandFrame[]
  const show = (...frames: HandFrame[][]) => queue.push(...frames.flat())
  let link: HTMLAnchorElement
  let clicks: number
  let scrolled: number[]

  /** Hand control on, with an open hand shown long enough to calibrate and settle. */
  const ready = async () => {
    await render()
    await turnOn()
    const frames = pinch.calibrationFrames + framesIn(500)
    show(hold(pose(0.5, 0.5, OPEN), frames))
    await runFrames(frames)
  }
  const play = async (...frames: HandFrame[][]) => {
    show(...frames)
    await runFrames(frames.flat().length)
  }
  const total = (tops: number[]) => tops.reduce((a, b) => a + b, 0)
  const quickPinch = () => [hold(pose(0.5, 0.5, CLOSED), 4), hold(pose(0.5, 0.5, OPEN), 4)]
  /** Pinched, the hand rises a tenth of the camera frame in a fifth of a second. */
  const rise = 0.1
  const grabUp = () => {
    const steps = framesIn(200)
    return [
      hold(pose(0.5, 0.5, CLOSED), pinch.confirmFrames),
      Array.from({ length: steps }, (_, i) => pose(0.5, 0.5 - (rise * (i + 1)) / steps, CLOSED)),
    ]
  }
  const letGo = () => hold(pose(0.5, 0.5 - rise, OPEN), pinch.confirmFrames)
  const after = (ms: number) => hold(pose(0.5, 0.5 - rise, OPEN), framesIn(ms))

  beforeEach(() => {
    queue = []
    tracker.createHandTracker.mockImplementation(async () => ({
      detect: () => sighting((queue.length > 1 ? queue.shift() : queue[0]) ?? null),
      close: tracker.close,
    }))
    link = document.createElement('a')
    link.href = '#is'
    link.textContent = 'İşler'
    document.body.append(link)
    clicks = 0
    link.addEventListener('click', (event) => {
      event.preventDefault()
      clicks++
    })
    document.elementsFromPoint = () => [link]
    scrolled = []
    vi.spyOn(window, 'scrollBy').mockImplementation(((options: ScrollToOptions) => {
      scrolled.push(options.top ?? 0)
    }) as typeof window.scrollBy)
  })

  afterEach(() => {
    link.remove()
    vi.restoreAllMocks()
  })

  it('a quick pinch clicks the link under the cursor once, and focuses it as a mouse would', async () => {
    await ready()
    await play(...quickPinch())
    expect(clicks).toBe(1)
    expect(document.activeElement).toBe(link)
    expect(scrolled).toEqual([])
  })

  it(`a pinch held longer than ${quick.maxMs} ms clicks nothing`, async () => {
    await ready()
    await play(hold(pose(0.5, 0.5, CLOSED), framesIn(quick.maxMs) + 4))
    await play(hold(pose(0.5, 0.5, OPEN), 4))
    expect(clicks).toBe(0)
  })

  it('a pinch and a move up scrolls the page down with the hand', async () => {
    await ready()
    await play(...grabUp(), hold(pose(0.5, 0.5 - rise, CLOSED), framesIn(1000)))
    // Up is down the page, by the tuned share of the screen per screen the hand moved (800 px).
    const expected = (rise / HAND_TUNING.frame.height) * 800 * HAND_TUNING.grab.scrollGain
    expect(Math.abs(total(scrolled) - expected)).toBeLessThanOrEqual(2)
    // A hand that came to rest before letting go doesn't glide.
    const rested = scrolled.length
    await play(letGo(), after(300))
    expect(scrolled.length).toBe(rested)
  })

  it.each([30, 15])(
    'letting go of a moving grab glides on briefly, the same way, at %s camera frames a second',
    async (fps) => {
      frameSeconds = 1 / fps
      await ready()
      await play(...grabUp(), letGo())
      const released = scrolled.length
      await play(after(1500))
      const glide = scrolled.slice(released)
      expect(glide.length).toBeGreaterThan(1)
      expect(glide.every((top) => top > 0)).toBe(true)
      // It is brief: it has stopped by then.
      const stopped = scrolled.length
      await play(after(300))
      expect(scrolled.length).toBe(stopped)
      expect(clicks).toBe(0)
    },
  )

  it('under reduced motion the page stops where the grab let go: no glide', async () => {
    reducedMotion = true
    await ready()
    await play(...grabUp(), letGo())
    const released = scrolled.length
    expect(released).toBeGreaterThan(0)
    await play(after(1000))
    expect(scrolled.length).toBe(released)
  })

  describe('a hand resting in a grab (#75)', () => {
    /** Almost the guard's radius up from where it rests: a jump the cursor takes a moment to follow. */
    const nudged = pose(0.5, 0.5 - HAND_TUNING.rest.radius * 0.9, CLOSED)
    /** Held still for `holdMs` after the pinch, then the jump, held there for `frames` frames. */
    const heldThenNudged = (holdMs: number, frames: number) => [
      hold(pose(0.5, 0.5, CLOSED), pinch.confirmFrames + framesIn(holdMs)),
      hold(nudged, frames),
    ]
    /** The jump comes four camera frames before the guard fires: the cursor is still moving then. */
    const restingGrab = () => heldThenNudged(HAND_TUNING.rest.ms - 4 * frameSeconds * 1000, 12)

    it('lets go without a glide, though the cursor was still moving', async () => {
      await ready()
      await play(...restingGrab())
      const scrolledBy = scrolled.length
      expect(scrolledBy).toBeGreaterThan(0)
      await play(hold(nudged, framesIn(1500)))
      expect(scrolled.length).toBe(scrolledBy)
    })

    it("tells a claimant (the Helix, the Galeri lightbox) that nothing may glide or fling on, as the guard's release does", async () => {
      const end = vi.fn((_options?: { glide: false }) => true)
      const unclaim = claimHandGrab({ move: () => true, end })
      await ready()
      await play(...restingGrab())
      expect(end).toHaveBeenCalledTimes(1)
      expect(end).toHaveBeenLastCalledWith({ glide: false })
      // The usual release, by opening the fingers, says nothing of the kind.
      await play(hold(pose(0.5, 0.5, OPEN), HAND_TUNING.arm.ms / (frameSeconds * 1000) + 3))
      await play(...heldThenNudged(quick.maxMs * 2, 3), hold(pose(0.5, 0.5, OPEN), 3))
      unclaim()
      expect(end).toHaveBeenCalledTimes(2)
      expect(end).toHaveBeenLastCalledWith(undefined)
    })
  })

  it('a pinch held a little past a click, drifting slightly, scrolls that drift and never glides', async () => {
    await ready()
    // About 430 ms closed while the hand drifts 2% of the frame up, then let go.
    const steps = framesIn(430)
    const drift = Array.from({ length: steps }, (_, i) =>
      pose(0.5, 0.5 - (0.02 * (i + 1)) / steps, CLOSED),
    )
    await play(hold(pose(0.5, 0.5, CLOSED), pinch.confirmFrames), drift)
    await play(hold(pose(0.5, 0.48, OPEN), pinch.confirmFrames))
    const released = scrolled.length
    await play(hold(pose(0.5, 0.48, OPEN), framesIn(1000)))
    expect(scrolled.length).toBe(released)
    expect(clicks).toBe(0)
  })

  it('scrolls nothing while the page is locked (the open menu), as the wheel does', async () => {
    await ready()
    const unlock = lockScroll(document.documentElement)
    await play(...grabUp(), letGo(), after(1000))
    unlock()
    expect(scrolled).toEqual([])
  })

  it('a claimed grab (the Helix on Home) goes to its claimant: no page scroll, no glide', async () => {
    const move = vi.fn((_up: number) => true)
    const end = vi.fn(() => true)
    const unclaim = claimHandGrab({ move, end })
    await ready()
    await play(...grabUp(), letGo(), after(300))
    unclaim()
    expect(move).toHaveBeenCalled()
    const ups = move.mock.calls.map(([up]) => up)
    expect(total(ups)).toBeGreaterThan(0)
    expect(end).toHaveBeenCalledTimes(1)
    expect(scrolled).toEqual([])
  })

  it('a sideways grab reaches its claimant (the Galeri lightbox) as horizontal moves (#59)', async () => {
    const move = vi.fn((_up: number, _right: number) => true)
    const unclaim = claimHandGrab({ move, end: () => true })
    await ready()
    // Pinched, the hand moves a tenth of the frame to the screen's left (the camera's right).
    const steps = framesIn(200)
    await play(
      hold(pose(0.5, 0.5, CLOSED), pinch.confirmFrames),
      Array.from({ length: steps }, (_, i) => pose(0.5 + (0.1 * (i + 1)) / steps, 0.5, CLOSED)),
      hold(pose(0.6, 0.5, CLOSED), framesIn(500)),
      hold(pose(0.6, 0.5, OPEN), pinch.confirmFrames),
    )
    unclaim()
    const rights = move.mock.calls.map(([, right]) => right)
    expect(total(rights)).toBeCloseTo(-0.1 / HAND_TUNING.frame.width, 2)
    expect(scrolled).toEqual([])
  })

  it('an unclaimed sideways grab scrolls nothing', async () => {
    await ready()
    const steps = framesIn(200)
    await play(
      hold(pose(0.5, 0.5, CLOSED), pinch.confirmFrames),
      Array.from({ length: steps }, (_, i) => pose(0.5 + (0.1 * (i + 1)) / steps, 0.5, CLOSED)),
      hold(pose(0.6, 0.5, OPEN), pinch.confirmFrames),
      hold(pose(0.6, 0.5, OPEN), framesIn(500)),
    )
    expect(scrolled).toEqual([])
  })

  it('turning Hand control off mid-grab lets go of the claimed grab', async () => {
    const end = vi.fn(() => true)
    const unclaim = claimHandGrab({ move: () => true, end })
    await ready()
    await play(...grabUp())
    await click(toggle())
    unclaim()
    expect(end).toHaveBeenCalledTimes(1)
  })
})

describe('over an external player (#59)', () => {
  const HINT = 'Oynatıcının içinde fareyi kullan'
  const { playerShowAfterMs, playerClearAfterMs } = HAND_TUNING.hints
  let under: Element | null
  let iframe: HTMLIFrameElement
  /** The hand shows on `shown` frames, then leaves. */
  let shown: boolean

  /** Camera frames that surely span `ms`, even when the first after turning on moves nothing. */
  const framesFor = (ms: number) => Math.ceil(ms / (frameSeconds * 1000)) + 2

  beforeEach(() => {
    // A loaded Vimeo or YouTube player, as `ExternalVideo` marks it.
    iframe = document.createElement('iframe')
    iframe.src = 'https://player.vimeo.com/video/1?dnt=1&autoplay=1'
    iframe.setAttribute('data-external-player', '')
    document.body.append(iframe)
    under = null
    shown = true
    document.elementsFromPoint = () => (under ? [under] : [])
    markCoachSeen(localStorage) // the coach would take focus and add its buttons
    tracker.createHandTracker.mockImplementation(async () => ({
      detect: () => sighting(shown ? pose(0.5, 0.5, 0.9) : null),
      close: tracker.close,
    }))
  })

  afterEach(() => iframe.remove())

  /** The hints' polite live region (#58), which says this hint too. */
  const live = () => container.querySelector('[data-hand-hints][aria-live="polite"]')!
  const said = () => live().textContent!.includes(HINT)
  const label = () => container.querySelector<HTMLElement>('[data-hand-ring]')!
  const labelled = () => label().dataset.player === 'true'

  it('says to use the mouse inside it once the cursor has held there, with a label by the ring', async () => {
    await render()
    await turnOn()
    await runFrames(2)
    expect(said()).toBe(false)
    expect(labelled()).toBe(false)
    under = iframe
    await runFrames(1)
    expect(labelled()).toBe(false) // a cursor passing over doesn't flash it
    await runFrames(framesFor(playerShowAfterMs))
    expect(said()).toBe(true)
    expect(labelled()).toBe(true)
    expect(label().textContent).toContain(HINT)
  })

  it('clears it once the cursor has stayed off the player, and at once when the hand leaves', async () => {
    await render()
    await turnOn()
    under = iframe
    await runFrames(framesFor(playerShowAfterMs))
    expect(said()).toBe(true)
    under = document.body
    await runFrames(framesFor(playerClearAfterMs))
    expect(said()).toBe(false)
    expect(labelled()).toBe(false)
    under = iframe
    await runFrames(framesFor(playerShowAfterMs))
    expect(labelled()).toBe(true)
    shown = false
    await runFrames(HAND_TUNING.lostAfterFrames)
    expect(said()).toBe(false)
    expect(labelled()).toBe(false)
  })

  it('moving in and out, at its edge or again later, says it only once per player', async () => {
    await render()
    await turnOn()
    let announced = 0
    let before = said()
    /** Runs frames one by one with the cursor where `at(i)` says, counting each new announcement. */
    const frames = async (count: number, at: (i: number) => Element | null) => {
      for (let i = 0; i < count; i++) {
        under = at(i)
        await runFrames(1)
        if (said() && !before) announced++
        before = said()
      }
    }
    // Flickering at the edge, then held over it, then away and back, then flickering again.
    await frames(30, (i) => (i % 2 === 0 ? iframe : document.body))
    await frames(framesFor(playerShowAfterMs), () => iframe)
    await frames(framesFor(playerClearAfterMs), () => document.body)
    await frames(framesFor(playerShowAfterMs), () => iframe)
    expect(labelled()).toBe(true) // the label still shows each time
    await frames(30, (i) => (i % 2 === 0 ? document.body : iframe))
    expect(announced).toBe(1)
  })

  it('an iframe that is not our external player gets no hint', async () => {
    const other = document.createElement('iframe')
    document.body.append(other)
    await render()
    await turnOn()
    under = other
    await runFrames(framesFor(playerShowAfterMs))
    expect(said()).toBe(false)
    expect(labelled()).toBe(false)
    other.remove()
  })

  it('the click-to-load poster before it is an ordinary target: no hint', async () => {
    const poster = document.createElement('button')
    poster.setAttribute('aria-label', 'Showreel videosunu oynat')
    document.body.append(poster)
    await render()
    await turnOn()
    under = poster
    await runFrames(framesFor(playerShowAfterMs))
    expect(said()).toBe(false)
    poster.remove()
  })
})

describe('after the controller is gone', () => {
  it('a camera granted after unmounting is stopped at once', async () => {
    let grant: (value: unknown) => void = () => {}
    getUserMedia.mockImplementationOnce(() => new Promise((resolve) => (grant = resolve)))
    await render()
    await click(toggle())
    await click(button('Aç'))
    await act(() => root.unmount())
    await act(async () => grant(stream()))
    expect(track.stop).toHaveBeenCalled()
    expect(tracker.createHandTracker).not.toHaveBeenCalled()
    root = createRoot(container) // a fresh root for afterEach to unmount
  })
})

describe('its lifetime (#58)', () => {
  const { noHandMs, coachNoHandMs, minFps, slowMs, sampleMs, graceMs } = HAND_TUNING.lifetime
  const pressed = () => toggle()!.getAttribute('aria-pressed')
  /** Whether a hand is in view, and whether it rests in a pinch (thumb touching index, #75). */
  let present: boolean
  let pinched: boolean
  /** Whether tracking keeps dropping out: 6 camera frames in 26 without the hand (#75). */
  let dropouts: boolean
  /** The room the tests leave around a limit they stop short of or run past. */
  const MARGIN_MS = 1000

  beforeEach(() => {
    present = false
    pinched = false
    dropouts = false
    let calls = 0
    markCoachSeen(localStorage) // the coach (which pauses the count) has been seen
    tracker.createHandTracker.mockImplementation(async () => ({
      detect: () => {
        const dropped = dropouts && calls++ % 26 >= 20
        return sighting(present && !dropped ? pose(0.5, 0.5, pinched ? CHIN_GAP : 0.9) : null)
      },
      close: tracker.close,
    }))
  })

  it(`no hand in view for ${noHandMs / 1000} s turns it off, stops the camera and says so`, async () => {
    await render()
    await turnOn()
    await runFor(noHandMs - 1000)
    expect(pressed()).toBe('true')
    await runFor(2000)
    expect(pressed()).toBe('false')
    expect(track.stop).toHaveBeenCalled()
    expect(tracker.close).toHaveBeenCalled()
    expect(status()).toBe('Elin görünmedi, elinle gezme kapandı')
  })

  it('a hand back in view before then starts the count afresh', async () => {
    await render()
    await turnOn()
    await runFor(noHandMs - 1000)
    present = true
    await runFor(500)
    present = false
    await runFor(noHandMs - 1000)
    expect(pressed()).toBe('true')
  })

  it('an open hand in view keeps it on', async () => {
    present = true
    await render()
    await turnOn()
    await runFor(noHandMs * 2)
    expect(pressed()).toBe('true')
  })

  it('a hand resting in a pinch, the first ever seen, does not keep it on (#75)', async () => {
    present = true
    pinched = true
    await render()
    await turnOn()
    await runFor(noHandMs - MARGIN_MS)
    expect(pressed()).toBe('true')
    await runFor(2 * MARGIN_MS)
    expect(pressed()).toBe('false')
    expect(status()).toBe('Elin görünmedi, elinle gezme kapandı')
  })

  it('a hand that pinches and rests lets it turn off noHandMs after the rest guard (#75)', async () => {
    present = true
    await render()
    await turnOn()
    await runFor(5 * MARGIN_MS) // an open hand: armed
    pinched = true
    // The last engaged frame is the guard's release, rest.ms after the pinch began.
    await runFor(HAND_TUNING.rest.ms + noHandMs - MARGIN_MS)
    expect(pressed()).toBe('true')
    await runFor(2 * MARGIN_MS)
    expect(pressed()).toBe('false')
  })

  it('a hand at the chin whose tracking keeps dropping out does not keep it on (#75)', async () => {
    present = true
    pinched = true
    dropouts = true
    await render()
    await turnOn()
    await runFor(noHandMs - MARGIN_MS)
    expect(pressed()).toBe('true')
    await runFor(2 * MARGIN_MS)
    expect(pressed()).toBe('false')
  })

  it(`while the coach is open it waits ${coachNoHandMs / 1000} s, not for ever`, async () => {
    localStorage.clear()
    await render()
    await turnOn()
    await runFor(coachNoHandMs - 1000)
    expect(pressed()).toBe('true')
    await runFor(2000)
    expect(pressed()).toBe('false')
  })

  it('closing the coach starts the count afresh', async () => {
    localStorage.clear()
    await render()
    await turnOn()
    await runFor(coachNoHandMs - 1000)
    await click(button('Atla'))
    await runFor(noHandMs - 1000)
    expect(pressed()).toBe('true')
    await runFor(2000)
    expect(pressed()).toBe('false')
  })

  it('a page at under 1 fps turns it off too', async () => {
    present = true
    pageSeconds = 1.25
    await render()
    await turnOn()
    await runFor(slowMs * 4)
    expect(pressed()).toBe('false')
    expect(status()).toBe('Bu cihazda akıcı çalışmıyor')
  })

  it(`a page under ${minFps} fps for ${slowMs / 1000} s turns it off: "Bu cihazda akıcı çalışmıyor"`, async () => {
    present = true
    pageSeconds = 1 / (minFps * 0.75)
    await render()
    await turnOn()
    await runFor(graceMs + slowMs - sampleMs * 2)
    expect(pressed()).toBe('true')
    await runFor(sampleMs * 4)
    expect(pressed()).toBe('false')
    expect(track.stop).toHaveBeenCalled()
    expect(status()).toBe('Bu cihazda akıcı çalışmıyor')
  })

  it.each([30, 60, 120])('a page at %s fps stays on', async (hz) => {
    present = true
    pageSeconds = 1 / hz
    await render()
    await turnOn()
    await runFor((graceMs + slowMs) * 2)
    expect(pressed()).toBe('true')
  })

  it('a short dip stays on', async () => {
    present = true
    await render()
    await turnOn()
    await runFor(graceMs + 500)
    pageSeconds = 1 / (minFps * 0.5)
    await runFor(slowMs - sampleMs * 2)
    pageSeconds = 1 / 60
    await runFor(slowMs)
    expect(pressed()).toBe('true')
  })
})

describe('the hints (#58)', () => {
  const { farPalm, nearPalm, darkLuma, brightLuma, showAfterMs, clearAfterMs, lumaEveryMs } =
    HAND_TUNING.hints
  const { width, height } = HAND_TUNING.hints.lumaSize
  const hintsShown = () => container.querySelector('[data-hand-hints]')!.textContent
  let palm: number
  let score: number
  /** A canvas context whose picture has mean luma `luma`, logging what is drawn, read and cleared. */
  const fakeCanvas = (luma: () => number) => {
    const log: unknown[][] = []
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          clearRect: (...args: unknown[]) => log.push(['clear', ...args]),
          beginPath: () => {},
          arc: () => {},
          fill: () => {},
          drawImage: (...args: unknown[]) => log.push(['draw', ...args]),
          getImageData: (...args: number[]) => {
            log.push(['read', ...args])
            return { data: new Uint8ClampedArray(args[2]! * args[3]! * 4).fill(luma()) }
          },
        }) as unknown as CanvasRenderingContext2D,
    )
    return { log, restore: () => getContext.mockRestore() }
  }

  beforeEach(() => {
    palm = nearPalm * 1.5
    score = 0.95
    markCoachSeen(localStorage)
    tracker.createHandTracker.mockImplementation(async () => ({
      detect: () => sighting(pose(0.5, 0.5, 0.9, palm), score),
      close: tracker.close,
    }))
  })

  it('"Biraz yaklaş" shows, politely, for a hand too far away, and clears when it comes closer', async () => {
    await render()
    await turnOn()
    const hints = container.querySelector('[data-hand-hints]')!
    expect(hints.getAttribute('aria-live')).toBe('polite')
    await runFor(showAfterMs * 2)
    expect(hintsShown()).toBe('')
    palm = farPalm * 0.8
    await runFor(showAfterMs / 2)
    expect(hintsShown()).toBe('')
    await runFor(showAfterMs)
    expect(hintsShown()).toBe(HINT_TEXT.far)
    palm = nearPalm * 1.5
    await runFor(clearAfterMs + 200)
    expect(hintsShown()).toBe('')
  })

  it('"Daha çok ışık" shows for a dark picture, read from a tiny canvas a few times a second', async () => {
    let luma = darkLuma / 2
    const canvas = fakeCanvas(() => luma)
    await render()
    await turnOn()
    await runFor(showAfterMs * 2)
    expect(hintsShown()).toBe(HINT_TEXT.dark)
    luma = brightLuma * 2
    await runFor(clearAfterMs * 2)
    expect(hintsShown()).toBe('')
    // Only ever the shrunk picture, at most every `lumaEveryMs`, and cleared once read.
    const reads = canvas.log.filter(([kind]) => kind === 'read')
    const draws = canvas.log.filter(([kind]) => kind === 'draw')
    const ms = (showAfterMs + clearAfterMs) * 2
    expect(reads.length).toBeGreaterThan(0)
    expect(reads.length).toBeLessThanOrEqual(Math.ceil(ms / lumaEveryMs) + 1)
    expect(reads.every(([, , , w, h]) => w === width && h === height)).toBe(true)
    expect(draws.every((args) => args[4] === width && args[5] === height)).toBe(true)
    canvas.log.forEach(([kind], i) => {
      if (kind === 'read') expect(canvas.log[i + 1]).toEqual(['clear', 0, 0, width, height])
    })
    canvas.restore()
  })

  it('a hand tracked unsurely in a bright picture shows nothing: brightness only', async () => {
    score = 0.3
    const canvas = fakeCanvas(() => brightLuma * 2)
    await render()
    await turnOn()
    await runFor(showAfterMs * 3)
    expect(hintsShown()).toBe('')
    canvas.restore()
  })

  it('turning off clears them', async () => {
    palm = farPalm * 0.8
    await render()
    await turnOn()
    await runFor(showAfterMs * 2)
    expect(hintsShown()).toBe(HINT_TEXT.far)
    await click(toggle())
    palm = nearPalm * 1.5
    await turnOn()
    expect(hintsShown()).toBe('')
  })
})

describe('after a reload in the same tab (#58)', () => {
  const pressed = () => toggle()!.getAttribute('aria-pressed')
  /** The browser's answer for the camera's permission, without asking the visitor. */
  const permission = (query: () => unknown) => {
    const api = { query: vi.fn(query) }
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: api })
    return api
  }
  /** The page hides as it unloads (`pagehide`, then hidden), and the old page goes away. */
  const unload = async () => {
    await act(() => {
      window.dispatchEvent(new Event('pagehide'))
      hidden = true
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await act(() => root.unmount())
  }
  /** A fresh page in this tab, loaded the way `how` says (a reload by default), shown or not. */
  const load = async ({ how = 'reload', shown = true } = {}) => {
    navigationType = how
    hidden = !shown
    root = createRoot(container)
    await render()
    await settle()
    await settle()
  }
  /** A full reload in this tab. */
  const reload = async () => {
    await unload()
    await load()
  }

  beforeEach(() => {
    markCoachSeen(localStorage)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('the tab keeps only when the page hid with it on, and a load takes that away at once', async () => {
    permission(async () => ({ state: 'prompt' }))
    await render()
    await turnOn()
    expect(sessionStorage.getItem(HAND_ON_KEY)).toBeNull()
    await unload()
    expect(Number(sessionStorage.getItem(HAND_ON_KEY))).toBeGreaterThan(0)
    await load()
    expect(sessionStorage.getItem(HAND_ON_KEY)).toBeNull()
  })

  it.each<[string, () => unknown]>([
    [
      'a reload long after the page hid',
      () => {
        const later = Date.now() + HAND_TUNING.lifetime.resumeWindowMs + 1000
        vi.spyOn(Date, 'now').mockReturnValue(later)
      },
    ],
    [
      'a tab the browser discarded',
      () => {
        Object.defineProperty(document, 'wasDiscarded', { configurable: true, value: true })
      },
    ],
    [
      'a mark copied without a time (an old or foreign flag)',
      () => sessionStorage.setItem(HAND_ON_KEY, '1'),
    ],
  ])('stays off after %s, asking for nothing', async (_, before) => {
    const api = permission(async () => ({ state: 'granted' }))
    await render()
    await turnOn()
    await unload()
    await before()
    await load()
    expect(pressed()).toBe('false')
    expect(api.query).not.toHaveBeenCalled()
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a duplicated or reopened tab (a new navigation)', { how: 'navigate' }],
    ['Back or Forward to this page', { how: 'back_forward' }],
    ['a page loaded hidden', { shown: false }],
  ])('stays off for %s, asking for nothing', async (_, how) => {
    const api = permission(async () => ({ state: 'granted' }))
    await render()
    await turnOn()
    await unload()
    await load(how)
    expect(pressed()).toBe('false')
    expect(api.query).not.toHaveBeenCalled()
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('comes back under React’s development double mount too (one check per page load)', async () => {
    permission(async () => ({ state: 'granted' }))
    await render()
    await turnOn()
    await unload()
    navigationType = 'reload'
    hidden = false
    root = createRoot(container)
    await act(() =>
      root.render(
        <StrictMode>
          <HandToggle />
          <HandControl />
        </StrictMode>,
      ),
    )
    await settle()
    await settle()
    await settle()
    expect(pressed()).toBe('true')
    expect(getUserMedia).toHaveBeenCalledTimes(2)
  })

  it('stays off if the page is hidden while the browser answers', async () => {
    let answer: (value: { state: string }) => void = () => {}
    permission(() => new Promise((resolve) => (answer = resolve)))
    await render()
    await turnOn()
    await unload()
    await load()
    hidden = true
    await act(async () => answer({ state: 'granted' }))
    await settle()
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('comes back on by itself while the camera is granted, without the consent note', async () => {
    const api = permission(async () => ({ state: 'granted' }))
    await render()
    await turnOn()
    await reload()
    expect(api.query).toHaveBeenCalledWith({ name: 'camera' })
    expect(pressed()).toBe('true')
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(note()).toBeNull()
    expect(button('Elinle gezmeyi kapat')).toBeDefined()
  })

  it.each<[string, () => unknown]>([
    ['the camera would prompt', async () => ({ state: 'prompt' })],
    ['the camera is denied', async () => ({ state: 'denied' })],
    [
      'the camera cannot be queried (the query throws, as in older browsers)',
      () => {
        throw new TypeError('camera')
      },
    ],
    ['the query rejects', () => Promise.reject(new TypeError('camera'))],
  ])('stays off, asking for nothing, when %s', async (_, query) => {
    permission(query)
    await render()
    await turnOn()
    await reload()
    expect(pressed()).toBe('false')
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(note()).toBeNull()
  })

  it('stays off without the Permissions API, asking for nothing', async () => {
    await render()
    await turnOn()
    await reload()
    expect(pressed()).toBe('false')
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('a new tab starts off: the browser is not even asked', async () => {
    const api = permission(async () => ({ state: 'granted' }))
    await render()
    await turnOn()
    await unload()
    sessionStorage.clear() // a new tab has its own, empty, session storage
    await load({ how: 'navigate' })
    expect(pressed()).toBe('false')
    expect(api.query).not.toHaveBeenCalled()
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it.each<[string, () => unknown]>([
    ['the toggle', () => click(toggle())],
    ['the ×', () => click(button('Elinle gezmeyi kapat'))],
    ['no hand in view', () => runFor(HAND_TUNING.lifetime.noHandMs + 1000)],
    [
      'a page that cannot stay smooth',
      async () => {
        pageSeconds = 1 / (HAND_TUNING.lifetime.minFps / 2)
        await runFor(HAND_TUNING.lifetime.graceMs + HAND_TUNING.lifetime.slowMs * 2)
      },
    ],
    ['a camera that ends', () => act(() => void track.dispatchEvent(new Event('ended')))],
    [
      'a hidden tab, shown again',
      () =>
        act(() => {
          hidden = true
          document.dispatchEvent(new Event('visibilitychange'))
          hidden = false
          document.dispatchEvent(new Event('visibilitychange'))
        }),
    ],
  ])('turned off by %s, a reload leaves it off', async (_, turnOff) => {
    permission(async () => ({ state: 'granted' }))
    await render()
    await turnOn()
    await turnOff()
    expect(pressed()).toBe('false')
    await reload()
    expect(pressed()).toBe('false')
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })
})

describe('the coach (#58)', () => {
  const coach = () => container.querySelector<HTMLElement>('[data-hand-coach]')
  const pressed = () => toggle()!.getAttribute('aria-pressed')

  it('shows once per browser, on first use: three steps, İleri, then Tamam', async () => {
    await render()
    await turnOn()
    expect(coach()!.getAttribute('role')).toBe('dialog')
    expect(coach()!.contains(document.activeElement)).toBe(true)
    for (const [i, step] of COACH_STEPS.entries()) {
      expect(coach()!.textContent).toContain(`${i + 1} / ${COACH_STEPS.length}`)
      expect(coach()!.textContent).toContain(step.text)
      await click(button(i < COACH_STEPS.length - 1 ? 'İleri' : 'Tamam'))
    }
    expect(coach()).toBeNull()
    expect(pressed()).toBe('true')
    // Off and on again, or on another visit: no coach.
    await click(toggle())
    await turnOn()
    expect(pressed()).toBe('true')
    expect(coach()).toBeNull()
  })

  it('announces each step politely', async () => {
    await render()
    await turnOn()
    const description = document.getElementById(coach()!.getAttribute('aria-describedby')!)!
    expect(description.getAttribute('aria-live')).toBe('polite')
    expect(description.textContent).toContain(COACH_STEPS[0].text)
  })

  it.each([
    ['Atla', () => click(button('Atla'))],
    ['Esc', () => press('Escape')],
  ])('%s skips it, and focus goes to the toggle, since it opened by itself', async (_, skip) => {
    await render()
    await turnOn()
    expect(coach()).not.toBeNull()
    await skip()
    expect(coach()).toBeNull()
    expect(document.activeElement).toBe(toggle())
    expect(pressed()).toBe('true')
  })

  it('opened by "?", focus goes back to the "?", even when the click left none (Safari)', async () => {
    markCoachSeen(localStorage)
    await render()
    await turnOn()
    ;(document.activeElement as HTMLElement | null)?.blur() // a mouse click in Safari
    await click(button('Nasıl kullanılır'))
    expect(coach()).not.toBeNull()
    await press('Escape')
    expect(coach()).toBeNull()
    expect(document.activeElement).toBe(button('Nasıl kullanılır'))
  })

  it('is a light, non-modal dialog', async () => {
    await render()
    await turnOn()
    expect(coach()!.getAttribute('aria-modal')).toBe('false')
  })

  it('its Esc and Tab do not reach the page’s own key handlers (the menu)', async () => {
    const menuKeys = vi.fn()
    document.addEventListener('keydown', menuKeys)
    await render()
    await turnOn()
    await press('Tab')
    await press('Escape')
    document.removeEventListener('keydown', menuKeys)
    expect(coach()).toBeNull()
    expect(menuKeys).not.toHaveBeenCalled()
  })

  it('does not open by itself over the open menu, and opens on the next turn-on', async () => {
    const menu = document.createElement('details')
    menu.open = true
    menu.innerHTML = `<summary>Menü</summary><div id="${MENU_PANEL_ID}"></div>`
    document.body.append(menu)
    await render()
    await turnOn()
    expect(coach()).toBeNull()
    await click(toggle())
    menu.open = false
    await turnOn()
    expect(coach()).not.toBeNull()
    menu.remove()
  })

  it('keeps Tab and Shift+Tab inside, step by step (Safari skips buttons)', async () => {
    await render()
    await turnOn()
    const [skip, next] = [button('Atla')!, button('İleri')!]
    expect(document.activeElement).toBe(next)
    await press('Tab')
    expect(document.activeElement).toBe(skip)
    await press('Tab')
    expect(document.activeElement).toBe(next)
    await press('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(skip)
  })

  it('"?" next to the preview replays it from the first step', async () => {
    markCoachSeen(localStorage)
    await render()
    await turnOn()
    expect(coach()).toBeNull()
    await click(button('Nasıl kullanılır'))
    expect(coach()!.textContent).toContain(`1 / ${COACH_STEPS.length}`)
    await click(button('İleri'))
    await click(button('Atla'))
    await click(button('Nasıl kullanılır'))
    expect(coach()!.textContent).toContain(`1 / ${COACH_STEPS.length}`)
  })
})
