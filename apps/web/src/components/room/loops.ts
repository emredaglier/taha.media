import { ROOM_TUNING } from '../../lib/room-tuning'

/**
 * The Featured Works' Preview loops on the Edit Room's screens (#129): one `<video>` per Work,
 * made the first time its screen plays. The room model picks which screens play (`livePlaces`):
 * - A live loop plays, and each new video frame is painted onto its screen (`paint`), which the
 *   desk mirror of a monitor reads too. Every screen shares one atlas that is uploaded whole, so
 *   frames are painted at most `ROOM_TUNING.loopPaintFps` times a second, all in the same tick.
 * - A loop out of range is paused: nothing paints over its screen, so it holds its last frame,
 *   and a screen whose loop never played keeps the Work's still.
 * - A loop that can't play (missing, unreadable without CORS, play refused) is dropped and its
 *   video let go: its screen gets the still back (`restore`) in case a frame was already on it.
 * - A hidden tab pauses every loop; the next `update` once it shows plays the live ones again.
 */
export type RoomLoops = {
  /** Plays the loops of the places that are `live`, pauses the others, and paints new frames; `seconds` is the frame's time. */
  update(live: readonly boolean[], seconds: number): void
  /** Whether place `place`'s screen shows a frame of its loop (so a late still must not paint over it). */
  showsFrame(place: number): boolean
  destroy(): void
}

type Loop = {
  video: HTMLVideoElement | null
  /** A video frame came that is not painted yet. */
  fresh: boolean
  /** The media time of the frame last painted (NaN: none yet). */
  paintedAt: number
  failed: boolean
}

/** Whether a video has a frame to show. */
const hasFrame = (video: HTMLVideoElement) =>
  video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0

/** Stops a video and lets go of its file and decoder. */
function release(video: HTMLVideoElement) {
  video.pause()
  video.removeAttribute('src')
  video.load()
  video.remove()
}

export function createRoomLoops(
  works: readonly { previewLoop: { src: string } }[],
  /** Where the hidden `<video>`s live in the page (iOS decodes a loop only when it is in the page). */
  host: Element,
  screen: {
    /** Paints `video`'s current frame onto place `place`'s screen. May throw if the frame is unreadable. */
    paint(place: number, video: HTMLVideoElement): void
    /** Puts place `place`'s still back on its screen. */
    restore(place: number): void
  },
): RoomLoops {
  const loops: Loop[] = works.map(() => ({
    video: null,
    fresh: false,
    paintedAt: Number.NaN,
    failed: false,
  }))
  let paintedSeconds = Number.NEGATIVE_INFINITY

  function fail(place: number) {
    const loop = loops[place]!
    if (loop.failed) return
    loop.failed = true
    if (loop.video) release(loop.video)
    loop.video = null
    // A frame may already be on the screen (or half of one): the still goes back either way.
    screen.restore(place)
  }

  /** The Work's `<video>`: muted, inline, looping, readable by WebGL (CORS, #50). */
  function videoOf(place: number): HTMLVideoElement {
    const loop = loops[place]!
    if (loop.video) return loop.video
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.defaultMuted = true
    video.loop = true
    video.playsInline = true
    video.preload = 'auto'
    video.setAttribute('aria-hidden', 'true')
    video.tabIndex = -1
    video.style.cssText =
      'position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
    video.addEventListener('error', () => fail(place))
    // Where the browser says when a frame is new, a frame is painted only then.
    if (typeof video.requestVideoFrameCallback === 'function') {
      const onFrame = () => {
        loop.fresh = true
        if (loop.video === video) video.requestVideoFrameCallback(onFrame)
      }
      video.requestVideoFrameCallback(onFrame)
    }
    video.src = works[place]!.previewLoop.src
    host.append(video)
    loop.video = video
    return video
  }

  /** Whether `video` has a frame not yet painted: told by the browser, else any move of its time. */
  const isNew = (loop: Loop, video: HTMLVideoElement) =>
    typeof video.requestVideoFrameCallback === 'function'
      ? loop.fresh
      : video.currentTime !== loop.paintedAt

  const onVisibility = () => {
    if (!document.hidden) return
    for (const loop of loops) loop.video?.pause()
  }
  document.addEventListener('visibilitychange', onVisibility)

  return {
    update(live, seconds) {
      // 10% slack: frame times jitter, and two 60 Hz frames must count as one 30 fps interval.
      const paintNow = seconds - paintedSeconds >= 0.9 / ROOM_TUNING.loopPaintFps
      if (paintNow) paintedSeconds = seconds
      for (let place = 0; place < loops.length; place++) {
        const loop = loops[place]!
        if (loop.failed) continue
        if (!live[place] || document.hidden) {
          // Paused whoever paused it: its screen holds the last frame painted.
          loop.video?.pause()
          continue
        }
        const video = videoOf(place)
        if (video.paused) {
          video.play().catch((error: unknown) => {
            // A pause before it started (out of range, the tab hid) is no failure.
            if (!(error instanceof DOMException && error.name === 'AbortError')) fail(place)
          })
        }
        if (!paintNow || !hasFrame(video) || !isNew(loop, video)) continue
        try {
          screen.paint(place, video)
        } catch {
          // Unreadable after all (no CORS): the still it is.
          fail(place)
          continue
        }
        loop.fresh = false
        loop.paintedAt = video.currentTime
      }
    },

    showsFrame(place) {
      const loop = loops[place]
      return loop !== undefined && !loop.failed && !Number.isNaN(loop.paintedAt)
    },

    destroy() {
      document.removeEventListener('visibilitychange', onVisibility)
      for (const loop of loops) {
        if (loop.video) release(loop.video)
        loop.video = null
      }
    },
  }
}
