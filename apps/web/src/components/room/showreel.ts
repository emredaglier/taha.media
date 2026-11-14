import type { OpeningState } from '../../lib/room-opening'

/**
 * The Showreel for the opening (#131): one more video, loaded with the room, played while it has a
 * share of the middle monitor and paused once it has handed over, ready for a scroll back up into
 * the opening (#140). A file that can't be read is let go at once and the opening shows the middle
 * monitor's own Work.
 */
export function createShowreel(
  src: string,
  /** Where the hidden `<video>` lives in the page (iOS decodes a video only when it is in the page). */
  host: Element,
  room: { setShowreel(video: HTMLVideoElement | null): void },
) {
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
  let done = false
  let begun = false // the opening has started: a Showreel not in by now stays out
  const drop = () => {
    if (done) return
    done = true
    room.setShowreel(null)
    video.pause()
    video.removeAttribute('src')
    video.load()
    video.remove()
  }
  const ready = new Promise<void>((resolve) => {
    // The middle monitor shows it once it has a frame; an error leaves the opening without it.
    video.addEventListener(
      'loadeddata',
      () => {
        // Late (the room gave up waiting and the opening began): it would pop in mid-opening.
        if (begun) drop()
        else if (!done) room.setShowreel(video)
        resolve()
      },
      { once: true },
    )
    video.addEventListener(
      'error',
      () => {
        drop()
        resolve()
      },
      { once: true },
    )
  })
  video.src = src
  host.append(video)
  let playing = false
  return {
    ready,
    update(opening: OpeningState) {
      const shown = opening.reel > 0
      if (shown) begun = true
      if (done || shown === playing || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
      playing = shown
      if (!shown) return video.pause() // kept for the way back up (#140)
      video.play().catch((error: unknown) => {
        // A pause before it started (a quick scroll in) is no failure; refused or unreadable is:
        // the Work's own picture, not a frozen frame.
        if (!(error instanceof DOMException && error.name === 'AbortError')) drop()
      })
    },
    destroy: drop,
  }
}
