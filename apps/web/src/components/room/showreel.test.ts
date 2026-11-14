// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { createOpeningState, openingAt } from '../../lib/room-opening'
import { createShowreel } from './showreel'

// jsdom plays no media: its methods are stand-ins that record what the Showreel asks of the video.
let play: Mock<() => Promise<void>>
beforeEach(() => {
  play = vi.fn(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

const make = () => {
  const host = document.createElement('div')
  const room = { setShowreel: vi.fn() }
  const reel = createShowreel('https://cdn.example/reel.mp4', host, room)
  return { host, room, reel, video: host.querySelector('video')! }
}
const at = (seconds: number) => openingAt(seconds, createOpeningState())
const hasFrame = (video: HTMLVideoElement) =>
  Object.defineProperty(video, 'readyState', { value: 2, configurable: true })

describe('the Showreel in the opening', () => {
  it('is ready, and on the middle monitor, once it has a frame', async () => {
    const { reel, room, video } = make()
    expect(room.setShowreel).not.toHaveBeenCalled()
    hasFrame(video)
    video.dispatchEvent(new Event('loadeddata'))
    await reel.ready
    expect(room.setShowreel).toHaveBeenCalledWith(video)
  })

  it('plays while it shows, pauses once it has handed over, and plays again on the way back up', async () => {
    const { reel, room, video, host } = make()
    hasFrame(video)
    video.dispatchEvent(new Event('loadeddata'))
    await reel.ready
    reel.update(at(0))
    reel.update(at(0.5))
    expect(play).toHaveBeenCalledTimes(1)

    reel.update(at(2.1)) // the hand-over (1.5 s, 0.5 s) is done
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1)
    expect(room.setShowreel).not.toHaveBeenCalledWith(null)
    expect(host.contains(video)).toBe(true)

    reel.update(at(1)) // scrolled back up into the opening (#140)
    expect(play).toHaveBeenCalledTimes(2)
  })

  it('stays when a quick scroll pauses it before it has started playing', async () => {
    play.mockRejectedValue(new DOMException('paused', 'AbortError'))
    const { reel, room, video } = make()
    hasFrame(video)
    video.dispatchEvent(new Event('loadeddata'))
    await reel.ready
    reel.update(at(0))
    reel.update(at(2.1))
    await Promise.resolve()
    expect(room.setShowreel).not.toHaveBeenCalledWith(null)
  })

  it('comes in late for a room that starts at rest, ready for a scroll up into the opening', async () => {
    const { reel, room, video } = make()
    reel.update(at(Infinity)) // drawn at rest: no Showreel showing to pop into
    hasFrame(video)
    video.dispatchEvent(new Event('loadeddata'))
    await reel.ready
    expect(room.setShowreel).toHaveBeenCalledWith(video)
  })

  it('a file that cannot be read does not hold the room back: the opening goes without it', async () => {
    const { reel, room, video, host } = make()
    video.dispatchEvent(new Event('error'))
    await reel.ready
    expect(room.setShowreel).not.toHaveBeenCalledWith(video)
    expect(host.contains(video)).toBe(false)
    reel.update(at(0))
    expect(play).not.toHaveBeenCalled()
  })

  it("goes back to the middle monitor's own Work when play is refused", async () => {
    play.mockRejectedValue(new DOMException('no', 'NotAllowedError'))
    const { reel, room, video } = make()
    hasFrame(video)
    video.dispatchEvent(new Event('loadeddata'))
    await reel.ready
    reel.update(at(0))
    await Promise.resolve()
    expect(room.setShowreel).toHaveBeenLastCalledWith(null)
  })

  it('is let go of when the room goes, even mid-opening', () => {
    const { reel, room, host } = make()
    reel.destroy()
    expect(room.setShowreel).toHaveBeenLastCalledWith(null)
    expect(host.querySelector('video')).toBeNull()
  })

  it('stays out if it comes in after the opening has begun, rather than popping in mid-opening', async () => {
    const { reel, room, video, host } = make()
    reel.update(at(0.5)) // the room gave up waiting and drew
    hasFrame(video)
    video.dispatchEvent(new Event('loadeddata'))
    await reel.ready
    expect(room.setShowreel).not.toHaveBeenCalledWith(video)
    expect(host.contains(video)).toBe(false)
  })
})
