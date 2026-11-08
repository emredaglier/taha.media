import { cropToCard } from '../../lib/helix-geometry'
import type { HelixWork } from '../FeaturedWorks'
import { colourTexture, uploadPicture } from './gl'

/**
 * The Featured Works' Preview loops on the Helix (#55): one `<video>` per Work, not per card, so
 * repeated cards cost nothing extra. A Work's loop loads the first time it is wanted, plays while
 * the motion model says it plays (`playingWorks`), and is paused otherwise. Its frames go into a
 * texture only while it plays; a card that doesn't show its loop shows its poster.
 */
export type PreviewLoops = {
  /** Plays the loops of the Works in `playing`, pauses the others, and uploads new frames. */
  update(playing: ReadonlySet<number>): void
  /** What a card of Work `work` shows of its loop now: a frame and its crop; null for the poster. */
  frame(work: number): LoopFrame | null
  destroy(): void
}

export type LoopFrame = { texture: WebGLTexture; crop: ReturnType<typeof cropToCard> }

type Loop = {
  video: HTMLVideoElement | null
  /** Holds the loop's latest frame while it plays (freed once it stops). */
  texture: WebGLTexture | null
  crop: ReturnType<typeof cropToCard>
  /** The moment of the frame in the texture: a frame is uploaded only once. */
  uploadedAt: number
  /** It can't play here (missing, unreadable without CORS, or refused): the poster stays. */
  failed: boolean
}

/** Whether a video has a frame to show. */
const hasFrame = (video: HTMLVideoElement) =>
  video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0

export function createPreviewLoops(
  gl: WebGL2RenderingContext,
  works: readonly Pick<HelixWork, 'loop' | 'poster'>[],
  /** Where the hidden `<video>`s live in the page (iOS decodes a loop only when it is in the page). */
  host: Element,
): PreviewLoops {
  const loops: Loop[] = works.map((work) => ({
    video: null,
    texture: null,
    crop: cropToCard(work.loop.width, work.loop.height, work.poster.focalPoint),
    uploadedAt: Number.NaN,
    failed: false,
  }))

  /** The Work's `<video>`: muted, inline, looping, readable by WebGL (CORS, #50). */
  function videoOf(loop: Loop, src: string): HTMLVideoElement {
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
    video.addEventListener('error', () => stop(loop, true))
    video.src = src
    host.append(video)
    loop.video = video
    return video
  }

  function stop(loop: Loop, failed = false) {
    if (failed) loop.failed = true
    loop.video?.pause()
    if (loop.texture) gl.deleteTexture(loop.texture)
    loop.texture = null
    loop.uploadedAt = Number.NaN
  }

  function upload(loop: Loop, video: HTMLVideoElement, focalPoint: { x: number; y: number }) {
    if (!hasFrame(video) || video.currentTime === loop.uploadedAt) return
    // Clamped at its edges, so a card's border never shows the opposite edge of the frame.
    loop.texture ??= colourTexture(gl, new Uint8Array([0, 0, 0, 0]))
    try {
      uploadPicture(gl, loop.texture, video)
    } catch {
      // Unreadable after all (no CORS): the poster it is.
      stop(loop, true)
      return
    }
    loop.uploadedAt = video.currentTime
    // Media that isn't quite 16:9 is cropped to fill the card, never stretched (#46). The poster's
    // focal point frames it, so the card doesn't jump between the two.
    loop.crop = cropToCard(video.videoWidth, video.videoHeight, focalPoint)
  }

  return {
    update(playing) {
      for (const [work, loop] of loops.entries()) {
        if (loop.failed) continue
        if (!playing.has(work)) {
          if (loop.video && !loop.video.paused) stop(loop)
          continue
        }
        const { loop: media, poster } = works[work]!
        const video = videoOf(loop, media.src)
        if (video.paused) {
          video.play().catch((error: unknown) => {
            // A pause before it started (the card turned away) is no failure.
            if (!(error instanceof DOMException && error.name === 'AbortError')) stop(loop, true)
          })
        }
        upload(loop, video, poster.focalPoint)
      }
    },

    frame(work) {
      const loop = loops[work]
      return loop?.texture && !loop.failed ? { texture: loop.texture, crop: loop.crop } : null
    },

    destroy() {
      for (const loop of loops) {
        stop(loop)
        if (!loop.video) continue
        loop.video.removeAttribute('src')
        loop.video.load()
        loop.video.remove()
      }
    },
  }
}
