/**
 * The Featured Works' Preview loops on the Edit Room's screens (#129): one `<video>` per Work,
 * made the first time its screen plays. The room model picks which screens play (`livePlaces`):
 * - A live loop plays, and each new frame is painted onto its screen (`paint`), which the desk
 *   mirror of a monitor reads too.
 * - A loop out of range is paused: nothing paints over its screen, so it holds its last frame,
 *   and a screen whose loop never played keeps the Work's still.
 * - A loop that can't play (missing, unreadable without CORS, play refused) is dropped: its
 *   screen keeps the still, painted again (`restore`) in case a frame was already on it.
 * - A hidden tab pauses every loop; the next `update` once it shows plays the live ones again.
 */
export type RoomLoops = {
  /** Plays the loops of the places that are `live`, pauses the others, and paints new frames. */
  update(live: readonly boolean[]): void
  destroy(): void
}

type Loop = {
  video: HTMLVideoElement | null
  /** The moment of the frame last painted (NaN: none yet), so a frame is painted only once. */
  paintedAt: number
  failed: boolean
}

/** Whether a video has a frame to show. */
const hasFrame = (video: HTMLVideoElement) =>
  video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0

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
  const loops: Loop[] = works.map(() => ({ video: null, paintedAt: Number.NaN, failed: false }))

  function fail(place: number) {
    const loop = loops[place]!
    if (loop.failed) return
    loop.failed = true
    loop.video?.pause()
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
    video.src = works[place]!.previewLoop.src
    host.append(video)
    loop.video = video
    return video
  }

  const pauseAll = () => {
    for (const loop of loops) loop.video?.pause()
  }
  const onVisibility = () => {
    if (document.hidden) pauseAll()
  }
  document.addEventListener('visibilitychange', onVisibility)

  return {
    update(live) {
      for (const [place, loop] of loops.entries()) {
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
        if (!hasFrame(video) || video.currentTime === loop.paintedAt) continue
        try {
          screen.paint(place, video)
        } catch {
          // Unreadable after all (no CORS): the still it is.
          fail(place)
          continue
        }
        loop.paintedAt = video.currentTime
      }
    },

    destroy() {
      document.removeEventListener('visibilitychange', onVisibility)
      for (const loop of loops) {
        if (!loop.video) continue
        loop.video.pause()
        loop.video.removeAttribute('src')
        loop.video.load()
        loop.video.remove()
        loop.video = null
      }
    },
  }
}
