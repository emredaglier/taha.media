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

import { HAND_TUNING } from '../../lib/hand-tuning'
import { CONSENT_TEXT, CONSENT_TITLE } from './ConsentNote'
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
  HTMLMediaElement.prototype.play = vi.fn(async () => {})
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
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
