// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

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

const videoOf = (place: number) =>
  host.querySelector<HTMLVideoElement>(`video[src$="loop-${place}.mp4"]`)
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
    loops.update(NONE)
    expect(host.querySelectorAll('video')).toHaveLength(0)
    loops.update(only(1))
    loops.update(only(1))
    expect(host.querySelectorAll('video')).toHaveLength(1)
    const video = videoOf(1)!
    expect(video.muted).toBe(true)
    expect(video.crossOrigin).toBe('anonymous')
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('leaves a never-played screen on its still', () => {
    loops.update(only(0))
    frameAt(0, 0.1)
    loops.update(only(0))
    expect(videoOf(2)).toBeNull()
    expect(paintedPlaces()).toEqual([0])
  })

  it('paints each new frame once onto its screen, which its desk mirror reads', () => {
    loops.update(only(1))
    frameAt(1, 0.1)
    loops.update(only(1))
    loops.update(only(1)) // same frame: nothing new to paint
    frameAt(1, 0.2)
    loops.update(only(1))
    expect(paint.mock.calls).toEqual([
      [1, videoOf(1)],
      [1, videoOf(1)],
    ])
  })

  it('pauses a loop that leaves range and holds its last frame', () => {
    loops.update(only(0))
    frameAt(0, 0.1)
    loops.update(only(0))
    loops.update(only(2))
    frameAt(0, 0.3) // a frame that would arrive if it still played
    loops.update(only(2))
    expect(videoOf(0)!.paused).toBe(true)
    expect(paintedPlaces()).toEqual([0])
    expect(restore).not.toHaveBeenCalled()
  })

  it('plays a held loop again when it comes back in range', () => {
    loops.update(only(0))
    loops.update(NONE)
    loops.update(only(0))
    expect(videoOf(0)!.paused).toBe(false)
    expect(play).toHaveBeenCalledTimes(2)
  })

  it('keeps the still of a loop that cannot load (missing, or no CORS)', () => {
    loops.update(only(3))
    videoOf(3)!.dispatchEvent(new Event('error'))
    frameAt(3, 0.1)
    loops.update(only(3))
    expect(paint).not.toHaveBeenCalled()
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('keeps the still of a loop whose play is refused', async () => {
    play.mockImplementationOnce(() => Promise.reject(new DOMException('No', 'NotAllowedError')))
    loops.update(only(3))
    await settle()
    frameAt(3, 0.1)
    loops.update(only(3))
    expect(paint).not.toHaveBeenCalled()
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('puts the still back when a loop fails after it showed frames', () => {
    loops.update(only(2))
    frameAt(2, 0.1)
    loops.update(only(2))
    videoOf(2)!.dispatchEvent(new Event('error'))
    expect(restore).toHaveBeenCalledWith(2)
  })

  it('keeps the still when a frame cannot be painted (unreadable after all)', () => {
    paint.mockImplementationOnce(() => {
      throw new DOMException('Tainted', 'SecurityError')
    })
    loops.update(only(2))
    frameAt(2, 0.1)
    loops.update(only(2))
    frameAt(2, 0.2)
    loops.update(only(2))
    expect(paint).toHaveBeenCalledTimes(1)
    expect(restore).toHaveBeenCalledWith(2)
    expect(videoOf(2)!.paused).toBe(true)
  })

  it('does not count a play cut short by a pause as a failure', async () => {
    play.mockImplementationOnce(() => Promise.reject(new DOMException('Paused', 'AbortError')))
    loops.update(only(1))
    await settle()
    frameAt(1, 0.1)
    loops.update(only(1))
    expect(paintedPlaces()).toEqual([1])
  })

  it('pauses every loop while the tab is hidden and plays the live ones when it shows', () => {
    loops.update(only(0, 1))
    setHidden(true)
    expect(videoOf(0)!.paused).toBe(true)
    expect(videoOf(1)!.paused).toBe(true)
    loops.update(only(0, 1)) // a stray frame while hidden plays nothing
    expect(videoOf(0)!.paused).toBe(true)
    setHidden(false)
    loops.update(only(0, 1))
    expect(videoOf(0)!.paused).toBe(false)
    expect(videoOf(1)!.paused).toBe(false)
  })

  it('stops and removes its videos when destroyed', () => {
    loops.update(only(0))
    const video = videoOf(0)!
    loops.destroy()
    expect(video.paused).toBe(true)
    expect(video.isConnected).toBe(false)
    setHidden(true) // the listener is gone: nothing throws
  })
})
