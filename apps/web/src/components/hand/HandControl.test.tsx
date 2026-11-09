// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tracker = vi.hoisted(() => ({
  createHandTracker: vi.fn(),
  close: vi.fn(),
}))
vi.mock('./tracker', () => ({ createHandTracker: tracker.createHandTracker }))

import { INDEX_KNUCKLE, INDEX_TIP, THUMB_TIP, WRIST, type HandFrame } from '../../lib/hand-gesture'
import { HELIX_TUNING } from '../../lib/helix-tuning'
import { HAND_TUNING } from '../../lib/hand-tuning'
import { CONSENT_TEXT, CONSENT_TITLE } from './ConsentNote'
import { claimHandGrab } from './grab'
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
/** The animation frames waiting to run, and the camera's clock they advance. */
let frames: ((now: number) => void)[]
let videoTime: number
/** The points the hand's hit test asked about. */
let hits: [number, number][]

const { minCores, minMemoryGb } = HELIX_TUNING.weakDevice

/** What the browser reports about the device (`deviceReport`), as own properties of navigator. */
const device = ({ cores, memory }: { cores: number; memory?: number }) => {
  Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: cores })
  Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: memory })
}

/** A camera stream with one video track. */
const stream = () => ({ getTracks: () => [track], getVideoTracks: () => [track] })

/** Runs `count` camera frames through the controller's tracking loop. */
const runFrames = (count: number) =>
  act(() => {
    for (let i = 0; i < count; i++) {
      videoTime += 1 / 30
      const due = frames
      frames = []
      for (const frame of due) frame(videoTime * 1000)
    }
  })

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
  frames = []
  videoTime = 0
  hits = []
  vi.stubGlobal('requestAnimationFrame', (frame: (now: number) => void) => frames.push(frame))
  vi.stubGlobal('cancelAnimationFrame', () => {})
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
        matches: DESKTOP_QUERIES.includes(query),
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
  // A capable desktop, whatever machine runs the tests: jsdom reports the host's cores (under the
  // weak-device line on CI runners) and no memory.
  device({ cores: minCores * 2, memory: minMemoryGb * 2 })
  HTMLMediaElement.prototype.play = vi.fn(async () => {})
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  // Back to jsdom's own navigator values.
  delete (navigator as { hardwareConcurrency?: number }).hardwareConcurrency
  delete (navigator as { deviceMemory?: number }).deviceMemory
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
      expect.arrayContaining(['text-sm', 'uppercase', 'whitespace-nowrap']),
    )
    expect(toggle()!.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['absolute', 'inset-0', 'text-sm', 'uppercase', 'whitespace-nowrap']),
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
    device({ cores: minCores - 1 })
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
    trackerWith(() => corner)
    await render()
    await turnOn()
    await runFrames(1)
    expect(hits.at(-1)).toEqual([999, 799])
  })
})

describe('pinching (#57)', () => {
  const { pinch, click: quick } = HAND_TUNING
  const PALM = 0.15
  const OPEN = 0.9
  const CLOSED = OPEN * pinch.calibrationShare * 0.5
  /** A hand with its index tip at (x, y) in the camera's picture and the thumb `gap` palms below. */
  const pose = (x: number, y: number, gap: number): HandFrame =>
    Array.from({ length: 21 }, (_, i) => {
      if (i === INDEX_TIP) return { x, y }
      if (i === THUMB_TIP) return { x, y: y + gap * PALM }
      if (i === INDEX_KNUCKLE) return { x, y: y + 0.2 }
      if (i === WRIST) return { x, y: y + 0.2 + PALM }
      return { x, y: y + 0.1 }
    })
  const hold = (frame: HandFrame, count: number) => Array<HandFrame>(count).fill(frame)
  /** The camera shows `frames` one per camera frame, then keeps showing the last. */
  let queue: HandFrame[]
  const show = (...frames: HandFrame[][]) => queue.push(...frames.flat())
  const ring = () => container.ownerDocument.querySelector<HTMLElement>('[data-hand-ring]')!
  const ping = () => ring().querySelector<HTMLElement>('[data-hand-ping]')!
  let link: HTMLAnchorElement
  let clicks: number
  let scrolled: number[]

  /** Hand control on, with an open hand shown long enough to calibrate and settle. */
  const ready = async () => {
    await render()
    await turnOn()
    show(hold(pose(0.5, 0.5, OPEN), pinch.calibrationFrames + 15))
    await runFrames(pinch.calibrationFrames + 15)
  }
  const play = async (...frames: HandFrame[][]) => {
    show(...frames)
    await runFrames(frames.flat().length)
  }
  const quickPinch = [hold(pose(0.5, 0.5, CLOSED), 4), hold(pose(0.5, 0.5, OPEN), 4)]
  /** Pinched, the hand rises a tenth of the camera frame, rests, and opens. */
  const rise = 0.1
  const grabUp = [
    hold(pose(0.5, 0.5, CLOSED), pinch.confirmFrames),
    Array.from({ length: 6 }, (_, i) => pose(0.5, 0.5 - (rise * (i + 1)) / 6, CLOSED)),
  ]
  const letGo = hold(pose(0.5, 0.5 - rise, OPEN), pinch.confirmFrames)

  beforeEach(() => {
    queue = []
    tracker.createHandTracker.mockImplementation(async () => ({
      detect: () => (queue.length > 1 ? queue.shift() : queue[0]) ?? null,
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
    await play(...quickPinch)
    expect(clicks).toBe(1)
    expect(document.activeElement).toBe(link)
    expect(scrolled).toEqual([])
  })

  it(`a pinch held longer than ${quick.maxMs} ms clicks nothing`, async () => {
    await ready()
    await play(hold(pose(0.5, 0.5, CLOSED), Math.ceil(quick.maxMs / (1000 / 30)) + 4))
    await play(hold(pose(0.5, 0.5, OPEN), 4))
    expect(clicks).toBe(0)
  })

  it('a pinch and a move up scrolls the page down with the hand', async () => {
    await ready()
    await play(...grabUp, hold(pose(0.5, 0.5 - rise, CLOSED), 30))
    const during = scrolled.reduce((a, b) => a + b, 0)
    // Up is down the page, by the tuned share of the screen per screen the hand moved (800 px).
    const expected = (rise / HAND_TUNING.frame.height) * 800 * HAND_TUNING.grab.scrollGain
    expect(Math.abs(during - expected)).toBeLessThanOrEqual(2)
    // A hand that came to rest before letting go doesn't glide.
    const rested = scrolled.length
    await play(letGo, hold(pose(0.5, 0.5 - rise, OPEN), 10))
    expect(scrolled.length).toBe(rested)
  })

  it('letting go of a moving grab glides on briefly, the same way', async () => {
    await ready()
    await play(...grabUp)
    await play(letGo)
    const released = scrolled.length
    // A second and a half (camera frames at 30 per second).
    await play(hold(pose(0.5, 0.5 - rise, OPEN), 45))
    const glide = scrolled.slice(released)
    expect(glide.length).toBeGreaterThan(1)
    // On down the page, the way the hand moved.
    expect(glide.every((top) => top > 0)).toBe(true)
    // It is brief: it has stopped by then.
    const stopped = scrolled.length
    await play(hold(pose(0.5, 0.5 - rise, OPEN), 10))
    expect(scrolled.length).toBe(stopped)
    expect(clicks).toBe(0)
  })

  it('a claimed grab (the Helix on Home) goes to its claimant: no page scroll, no glide', async () => {
    const move = vi.fn((_up: number) => true)
    const end = vi.fn(() => true)
    const unclaim = claimHandGrab({ move, end })
    await ready()
    await play(...grabUp, letGo, hold(pose(0.5, 0.5 - rise, OPEN), 10))
    unclaim()
    expect(move).toHaveBeenCalled()
    const ups = move.mock.calls.map(([up]) => up)
    expect(ups.reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
    expect(end).toHaveBeenCalledTimes(1)
    expect(scrolled).toEqual([])
  })

  it('turning Hand control off mid-grab lets go of the claimed grab', async () => {
    const end = vi.fn(() => true)
    const unclaim = claimHandGrab({ move: () => true, end })
    await ready()
    await play(...grabUp)
    await click(toggle())
    unclaim()
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('the ring fills while the fingers are pinched, and pings on a click', async () => {
    await ready()
    expect(ring().dataset.pinched).toBe('false')
    await play(hold(pose(0.5, 0.5, CLOSED), pinch.confirmFrames + 1))
    expect(ring().dataset.pinched).toBe('true')
    expect(ping().dataset.on).not.toBe('true')
    await play(hold(pose(0.5, 0.5, OPEN), pinch.confirmFrames + 1))
    expect(ring().dataset.pinched).toBe('false')
    expect(ping().dataset.on).toBe('true')
  })

  it('the ring animates only with motion allowed', async () => {
    await ready()
    const animated = [ring(), ping()]
      .flatMap((element) => element.className.split(/\s+/))
      .filter((name) => /(^|:)(animate|transition)/.test(name))
    expect(animated.length).toBeGreaterThan(0)
    for (const name of animated) expect(name.startsWith('motion-safe:')).toBe(true)
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
