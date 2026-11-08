import { cropToCard, type PictureCrop } from '../../lib/helix-geometry'
import type { HelixWork } from '../FeaturedWorks'
import { colourTexture, uploadPicture } from './gl'

/**
 * The Featured Works' Preview loops on the Helix (#55): one `<video>` per Work, not per card, so
 * repeated cards cost nothing extra. What plays and what is kept comes from the motion model
 * (`previewLoops`):
 * - A playing Work's loop loads the first time it is wanted, plays, and its new frames go into a
 *   texture.
 * - A held Work that stopped playing is paused, and its texture keeps the last frame: its cards
 *   freeze on it.
 * - Any other Work is paused and its texture freed: its cards show the poster again.
 */
export type PreviewLoops = {
  /** Plays the loops of `playing`, pauses the others, and keeps only the frames of `held`. */
  update(playing: ReadonlySet<number>, held: ReadonlySet<number>): void
  /** Pauses every loop (the tab is hidden), keeping every frame; the next `update` plays again. */
  pause(): void
  /** The frame a card of Work `work` shows of its loop (moving or frozen); null for the poster. */
  frame(work: number): LoopFrame | null
  destroy(): void
}

export type LoopFrame = { texture: WebGLTexture; crop: PictureCrop }

type Loop = {
  video: HTMLVideoElement | null
  /** Holds the loop's latest frame while the Work is held. */
  texture: WebGLTexture | null
  crop: PictureCrop
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
  works: readonly Pick<HelixWork, 'previewLoop' | 'poster'>[],
  /** Where the hidden `<video>`s live in the page (iOS decodes a loop only when it is in the page). */
  host: Element,
): PreviewLoops {
  const loops: Loop[] = works.map(({ previewLoop, poster }) => ({
    video: null,
    texture: null,
    crop: cropToCard(previewLoop.width, previewLoop.height, poster.focalPoint),
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
    video.addEventListener('error', () => fail(loop))
    video.src = src
    host.append(video)
    loop.video = video
    return video
  }

  /** Lets the frame go: the Work's cards show the poster again. */
  function release(loop: Loop) {
    if (loop.texture) gl.deleteTexture(loop.texture)
    loop.texture = null
    loop.uploadedAt = Number.NaN
  }

  function fail(loop: Loop) {
    loop.failed = true
    loop.video?.pause()
    release(loop)
  }

  function upload(loop: Loop, video: HTMLVideoElement, focalPoint: { x: number; y: number }) {
    if (!hasFrame(video) || video.currentTime === loop.uploadedAt) return
    // Clamped at its edges, so a card's border never shows the opposite edge of the frame.
    loop.texture ??= colourTexture(gl, new Uint8Array([0, 0, 0, 0]))
    try {
      uploadPicture(gl, loop.texture, video)
    } catch {
      // Unreadable after all (no CORS): the poster it is.
      fail(loop)
      return
    }
    loop.uploadedAt = video.currentTime
    // Media that isn't quite 16:9 is cropped to fill the card, never stretched (#46). The poster's
    // focal point frames it, so the card doesn't jump between the two.
    loop.crop = cropToCard(video.videoWidth, video.videoHeight, focalPoint)
  }

  return {
    update(playing, held) {
      for (const [work, loop] of loops.entries()) {
        if (loop.failed) continue
        if (!playing.has(work)) {
          // Paused whoever paused it; the frame stays only while the Work is held.
          loop.video?.pause()
          if (!held.has(work)) release(loop)
          continue
        }
        const { previewLoop, poster } = works[work]!
        const video = videoOf(loop, previewLoop.src)
        if (video.paused) {
          video.play().catch((error: unknown) => {
            // A pause before it started (the card turned away, the tab hid) is no failure.
            if (!(error instanceof DOMException && error.name === 'AbortError')) fail(loop)
          })
        }
        upload(loop, video, poster.focalPoint)
      }
    },

    pause() {
      for (const loop of loops) loop.video?.pause()
    },

    frame(work) {
      const loop = loops[work]
      return loop?.texture && !loop.failed ? { texture: loop.texture, crop: loop.crop } : null
    },

    destroy() {
      for (const loop of loops) {
        loop.video?.pause()
        release(loop)
        if (!loop.video) continue
        loop.video.removeAttribute('src')
        loop.video.load()
        loop.video.remove()
      }
    },
  }
}
