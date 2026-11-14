// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { ROOM_TUNING } from '../../lib/room-tuning'
import { createRoomLoops, type RoomLoops } from './loops'

// jsdom plays no media: each <video> is a stub whose play, pause and frames the test drives.
type Stub = HTMLVideoElement & { stubPaused?: boolean }
let play: Mock<(this: Stub) => Promise<void>>
let hidden: boolean

const works = Array.from({ length: 4 }, (_, place) => ({
  previewLoop: { src: `https://media.test/loop-${place}.mp4` },
}))
const NONE = [false, false, false, false]
const only = (...places: number[]) => NONE.map((_, place) => places.includes(place))

let host: HTMLElement
let paint: Mock<(place: number, video: HTMLVideoElement) => void>
let restore: Mock<(place: number) => void>
let loops: RoomLoops
let videos: HTMLVideoElement[]
let seconds: number
let visibility: { added: unknown; removed: unknown }

/** One room frame, a paint interval after the last. */
const tick = (live: readonly boolean[]) => {
  seconds += 1 / ROOM_TUNING.loopPaintFps
  loops.update(live, seconds)
}
const videoOf = (place: number) =>
  videos.find((video) => video.getAttribute('src')?.endsWith(`loop-${place}.mp4`)) ?? null
/** The loop has decoded a frame at `time` seconds. */
const frameAt = (place: number, time: number) => {
  const video = videoOf(place)!
  Object.defineProperty(video, 'readyState', { configurable: true, value: 4 })
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: 640 })
  Object.defineProperty(video, 'currentTime', { configurable: true, value: time })
}
const paintedPlaces = () => paint.mock.calls.map(([place]) => place)
const setHidden = (value: boolean) => {
  hidden = value
  document.dispatchEvent(new Event('visibilitychange'))
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  hidden = false
  seconds = 0
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  play = vi.fn(function (this: Stub) {
    this.stubPaused = false
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: Stub) {
    this.stubPaused = true
  })
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function (this: Stub) {
    return this.stubPaused ?? true
  })
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  host = document.createElement('div')
  document.body.append(host)
  // Every video made, kept after the player lets it go.
  videos = []
  const append = host.append.bind(host)
  vi.spyOn(host, 'append').mockImplementation((...nodes) => {
    videos.push(...(nodes as HTMLVideoElement[]))
    append(...nodes)
  })
  visibility = { added: null, removed: null }
  const add = document.addEventListener.bind(document)
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'visibilitychange') visibility.added = listener
    add(type, listener, options)
  })
  const remove = document.removeEventListener.bind(document)
  vi.spyOn(document, 'removeEventListener').mockImplementation((type, listener, options) => {
    if (type === 'visibilitychange') visibility.removed = listener
    remove(type, listener, options)
  })
  paint = vi.fn()
  restore = vi.fn()
  loops = createRoomLoops(works, host, { paint, restore })
})

afterEach(() => {
  loops.destroy()
  host.remove()
  vi.restoreAllMocks()
})

describe('the room loop player', () => {
  it('loads a loop only the first time its screen plays, one video per Work', () => {
    tick(NONE)
    expect(videos).toHaveLength(0)
    tick(only(1))
    tick(only(1))
    expect(videos).toHaveLength(1)
    const video = videoOf(1)!
    expect(video.muted).toBe(true)
    expect(video.crossOrigin).toBe('anonymous')
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('leaves a never-played screen on its still', () => {
    tick(only(0))
    frameAt(0, 0.1)
    tick(only(0))
    expect(videoOf(2)).toBeNull()
    expect(paintedPlaces()).toEqual([0])
    expect(loops.showsFrame(0)).toBe(true)
    expect(loops.showsFrame(2)).toBe(false)
  })

  it('paints each new frame once onto its screen, which its desk mirror reads', () => {
    tick(only(1))
    frameAt(1, 0.1)
    tick(only(1))
    tick(only(1)) // same frame: nothing new to paint
    frameAt(1, 0.2)
    tick(only(1))
    expect(paint.mock.calls).toEqual([
      [1, videoOf(1)],
      [1, videoOf(1)],
    ])
  })

  it('paints at most the tuned number of times a second, every live loop in the same tick', () => {
    tick(only(0, 1))
    frameAt(0, 0.1)
    frameAt(1, 0.1)
    tick(only(0, 1))
    expect(paintedPlaces()).toEqual([0, 1])
    frameAt(0, 0.11)
    frameAt(1, 0.11)
    loops.update(only(0, 1), seconds + 0.5 / ROOM_TUNING.loopPaintFps) // a 120 Hz screen's next tick
    expect(paint).toHaveBeenCalledTimes(2)
    tick(only(0, 1))
    expect(paintedPlaces()).toEqual([0, 1, 0, 1])
  })

  it('paints only when the browser reports a new video frame, where it can', () => {
    const frames = new Map<HTMLVideoElement, () => void>()
    Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
      configurable: true,
      value(this: HTMLVideoElement, callback: () => void) {
        frames.set(this, callback)
        return 1
      },
    })
    try {
      tick(only(0))
      frameAt(0, 0.1) // time moves, but no new frame was shown
      tick(only(0))
      expect(paint).not.toHaveBeenCalled()
      frames.get(videoOf(0)!)!()
      tick(only(0))
      frameAt(0, 0.2)
      tick(only(0)) // no frame since
      expect(paintedPlaces()).toEqual([0])
      frames.get(videoOf(0)!)!()
      tick(only(0))
      expect(paintedPlaces()).toEqual([0, 0])
    } finally {
      delete (HTMLVideoElement.prototype as { requestVideoFrameCallback?: unknown })
        .requestVideoFrameCallback
    }
  })

  it('pauses a loop that leaves range and holds its last frame', () => {
    tick(only(0))
    frameAt(0, 0.1)
    tick(only(0))
    tick(only(2))
    frameAt(0, 0.3) // a frame that would arrive if it still played
    tick(only(2))
    expect(videoOf(0)!.paused).toBe(true)
    expect(paintedPlaces()).toEqual([0])
    expect(loops.showsFrame(0)).toBe(true)
    expect(restore).not.toHaveBeenCalled()
  })

  it('plays a held loop again when it comes back in range', () => {
    tick(only(0))
    tick(NONE)
    tick(only(0))
    expect(videoOf(0)!.paused).toBe(false)
    expect(play).toHaveBeenCalledTimes(2)
  })

  it('keeps the still of a loop that cannot load (missing, or no CORS), and lets its video go', () => {
    tick(only(3))
    const video = videoOf(3)!
    video.dispatchEvent(new Event('error'))
    tick(only(3))
    expect(paint).not.toHaveBeenCalled()
    expect(play).toHaveBeenCalledTimes(1)
    expect(video.hasAttribute('src')).toBe(false)
    expect(video.isConnected).toBe(false)
  })

  it('keeps the still of a loop whose play is refused, and stops its download', async () => {
    play.mockImplementationOnce(() => Promise.reject(new DOMException('No', 'NotAllowedError')))
    tick(only(3))
    const video = videoOf(3)!
    await settle()
    tick(only(3))
    expect(paint).not.toHaveBeenCalled()
    expect(play).toHaveBeenCalledTimes(1)
    expect(video.hasAttribute('src')).toBe(false)
  })

  it('puts the still back when a loop fails after it showed frames', () => {
    tick(only(2))
    frameAt(2, 0.1)
    tick(only(2))
    videoOf(2)!.dispatchEvent(new Event('error'))
    expect(restore).toHaveBeenCalledWith(2)
    expect(loops.showsFrame(2)).toBe(false)
  })

  it('keeps the still when a frame cannot be painted (unreadable after all)', () => {
    paint.mockImplementationOnce(() => {
      throw new DOMException('Tainted', 'SecurityError')
    })
    tick(only(2))
    const video = videoOf(2)!
    frameAt(2, 0.1)
    tick(only(2))
    tick(only(2))
    expect(paint).toHaveBeenCalledTimes(1)
    expect(restore).toHaveBeenCalledWith(2)
    expect(video.paused).toBe(true)
  })

  it('does not count a play cut short by a pause as a failure', async () => {
    play.mockImplementationOnce(() => Promise.reject(new DOMException('Paused', 'AbortError')))
    tick(only(1))
    await settle()
    frameAt(1, 0.1)
    tick(only(1))
    expect(paintedPlaces()).toEqual([1])
  })

  it('pauses every loop while the tab is hidden and plays the live ones when it shows', () => {
    tick(only(0, 1))
    setHidden(true)
    expect(videoOf(0)!.paused).toBe(true)
    expect(videoOf(1)!.paused).toBe(true)
    tick(only(0, 1)) // a stray frame while hidden plays nothing
    expect(videoOf(0)!.paused).toBe(true)
    setHidden(false)
    tick(only(0, 1))
    expect(videoOf(0)!.paused).toBe(false)
    expect(videoOf(1)!.paused).toBe(false)
  })

  it('stops, empties and removes its videos and stops listening when destroyed', () => {
    tick(only(0))
    const video = videoOf(0)!
    loops.destroy()
    expect(video.paused).toBe(true)
    expect(video.hasAttribute('src')).toBe(false)
    expect(video.isConnected).toBe(false)
    expect(visibility.added).toBeTypeOf('function')
    expect(visibility.removed).toBe(visibility.added)
  })
})
