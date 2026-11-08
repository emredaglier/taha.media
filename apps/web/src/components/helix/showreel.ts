import { cropToCard, cropToFill, HELIX_SHAPE, SLOT_PITCH } from '../../lib/helix-geometry'
import type { HelixShowreel } from '../Hero'
import { colourTexture, float, link, uniforms, uploadPicture } from './gl'

/**
 * The Showreel layer of the opening (#54, pass 2): the Showreel loop as a video texture, else its
 * poster, else a plain block in the hero's colour. The zoom and the melt run the same way in all
 * three. At zoom 0 it fills the screen as the static hero's media does (`object-fit: cover`), and
 * it shrinks onto the front card, its crop widening from the screen's shape to 16:9.
 */
export type ShowreelLayer = {
  /**
   * Resolves once the layer shows what the static hero shows: its playing loop at the same moment,
   * or its poster. The Helix takes over from the static hero then, under a matching picture.
   * Never waits longer than `HAND_OVER_MS`.
   */
  handOver(shown: HTMLVideoElement | null): Promise<void>
  /** Draws it into the bound target, as the front card at `slot`, `zoom` of the way (eased). */
  draw(frame: ShowreelFrame): void
  /** Plays the loop while the Showreel is on screen, and pauses it once it has melted away. */
  play(on: boolean): void
  destroy(): void
}

export type ShowreelFrame = {
  zoom: number
  slot: number
  /** The camera's scale at this zoom, as the cards have it. */
  scale: number
  focal: number
  /** The screen's shape (width / height). */
  aspect: number
}

/** The longest the Helix waits for the Showreel before taking over from the static hero anyway. */
const HAND_OVER_MS = 2500
/** Close enough to the static loop's moment to call the frames the same (one frame at 30 fps). */
const IN_STEP_SECONDS = 1 / 30
const CENTRE = { x: 50, y: 50 }

const VERTEX = `#version 300 es
in vec2 aPos;
uniform float uSlot, uFocal, uAspect, uScale, uZoom;
out vec2 vUv;
const vec2 CARD = vec2(${float(HELIX_SHAPE.cardHeight * HELIX_SHAPE.cardRatio)}, ${float(HELIX_SHAPE.cardHeight)});
const float RADIUS = ${float(HELIX_SHAPE.radius)};
const float RADIUS_STEP = ${float(HELIX_SHAPE.radiusStep)};
const float CAMERA_Z = ${float(HELIX_SHAPE.cameraZ)};
const float TWIST = ${float(HELIX_SHAPE.twist)};
const float PITCH = ${float(SLOT_PITCH)};
void main() {
  vUv = aPos;
  // The card at uSlot on the cylinder, as the card pass places it (scaled by the camera)...
  vec2 local = (aPos - 0.5) * CARD;
  float r = RADIUS + uSlot * RADIUS_STEP;
  float theta = uSlot * TWIST + local.x / r;
  vec3 p = vec3(sin(theta) * r, local.y - uSlot * PITCH, cos(theta) * r);
  vec2 card = vec2(p.x * uFocal / uAspect, p.y * uFocal) / (CAMERA_Z - p.z) * uScale;
  // ...reached from the whole screen as the zoom runs.
  gl_Position = vec4(mix(aPos * 2.0 - 1.0, card, uZoom), 0.0, 1.0);
}`

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uMap;
uniform vec4 uFrom, uTo;
uniform float uZoom;
out vec4 outColor;
void main() {
  vec4 crop = mix(uFrom, uTo, uZoom);
  vec4 c = texture(uMap, vUv * crop.xy + crop.zw);
  outColor = vec4(c.rgb * c.a, c.a);   // premultiplied, as every target is
}`

/** The URL in an image's srcset closest above `width` px (the largest if none is), else `src`. */
function sourceFor(image: { src: string; srcset: string }, width: number): string {
  const candidates = image.srcset
    .split(',')
    .map((entry) => entry.trim().split(/\s+/))
    .map(([url, size]) => ({ url: url ?? '', width: Number.parseInt(size ?? '', 10) }))
    .filter((each) => each.url && Number.isFinite(each.width))
    .sort((a, b) => a.width - b.width)
  return (candidates.find((each) => each.width >= width) ?? candidates.at(-1))?.url ?? image.src
}

const once = (target: EventTarget, type: string) =>
  new Promise<void>((resolve) => target.addEventListener(type, () => resolve(), { once: true }))

/** Whether a video is showing moving frames. */
const playing = (video: HTMLVideoElement) =>
  !video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime > 0

/**
 * Seeks `video` to the moment `shown` is at, allowing for the time the seek itself takes (measured
 * on the first try), so a swap from one to the other isn't seen.
 */
async function catchUp(video: HTMLVideoElement, shown: HTMLVideoElement) {
  let lag = 0
  for (let attempt = 0; attempt < 2; attempt++) {
    const target = shown.currentTime + lag
    if (!(target < video.duration)) return
    const seeked = once(video, 'seeked')
    video.currentTime = target
    await seeked
    lag = shown.currentTime - video.currentTime
    if (Math.abs(lag) < IN_STEP_SECONDS) return
  }
}

export function createShowreelLayer(
  gl: WebGL2RenderingContext,
  media: HelixShowreel,
  mesh: { array: WebGLVertexArrayObject; count: number },
  block: Uint8Array,
  /** Where the hidden `<video>` lives in the page (iOS decodes a loop only when it is in the page). */
  host: Element,
): ShowreelLayer {
  const program = link(gl, VERTEX, FRAGMENT)
  const at = uniforms(gl, program, [
    'uSlot',
    'uFocal',
    'uAspect',
    'uScale',
    'uZoom',
    'uMap',
    'uFrom',
    'uTo',
  ])
  const texture = colourTexture(gl, block)
  let destroyed = false
  /** What the texture holds now, and its size and focal point for the crops. */
  let shows: 'block' | 'poster' | 'video' = 'block'
  let picture = { width: 16, height: 9, focalPoint: CENTRE }

  // The poster: what shows while the loop isn't playing, and all there is without a loop. Like the
  // loop, it loads only once the Showreel is wanted (not when Home comes back straight to a Work).
  let poster: HTMLImageElement | null = null
  let posterLoaded: Promise<void> | null = null
  const loadPoster = () => {
    if (posterLoaded) return posterLoaded
    if (!media.poster) return (posterLoaded = Promise.resolve())
    const image = new Image()
    // WebGL can only read media served with CORS (production: the bucket rule, #50).
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.src = sourceFor(media.poster, Math.min(window.devicePixelRatio || 1, 2) * innerWidth)
    posterLoaded = image.decode().then(
      () => {
        if (!destroyed) poster = image
      },
      // Unreadable (no CORS) or missing: the block stands in.
      () => undefined,
    )
    return posterLoaded
  }

  // The loop: muted, inline, looping, its own element (the static hero's can't be read by WebGL).
  let video: HTMLVideoElement | null = null
  let videoFailed = false
  let running = false
  let loopFailed: () => void = () => undefined
  if (media.video) {
    video = document.createElement('video')
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
    video.addEventListener('error', () => {
      videoFailed = true
      loopFailed()
    })
    host.append(video)
  }
  // Settles once the loop has started to play, or failed to (unreadable, missing, autoplay off).
  const videoPlaying: Promise<void> = video
    ? new Promise((resolve, reject) => {
        loopFailed = () => reject(new Error('The Showreel loop does not play'))
        video!.addEventListener('playing', () => resolve(), { once: true })
      })
    : Promise.reject(new Error('No loop'))
  videoPlaying.catch(() => undefined)

  const play = (on: boolean) => {
    if (on) loadPoster()
    if (!video || !media.video || videoFailed || on === running) return
    running = on
    if (!on) {
      video.pause()
      return
    }
    if (!video.getAttribute('src')) video.src = media.video.src
    video.play().catch(() => loopFailed())
  }

  /** Puts the best picture there is into the texture: the playing loop, the poster, the block. */
  function refresh() {
    // Once the loop has shown, it keeps its last frame while paused (until a replay resumes it).
    const loop = video && !videoFailed && video.videoWidth > 0 ? video : null
    if (loop && (playing(loop) || shows === 'video')) {
      if (shows === 'video' && !playing(loop)) return
      try {
        uploadPicture(gl, texture, loop)
        shows = 'video'
        picture = { width: loop.videoWidth, height: loop.videoHeight, focalPoint: CENTRE }
        return
      } catch {
        // Unreadable after all (no CORS): the poster or the block it is.
        videoFailed = true
      }
    }
    if (poster && shows !== 'poster') {
      try {
        uploadPicture(gl, texture, poster)
        shows = 'poster'
        picture = {
          width: poster.naturalWidth,
          height: poster.naturalHeight,
          focalPoint: media.poster?.focalPoint ?? CENTRE,
        }
      } catch {
        poster = null
      }
    }
  }

  return {
    handOver(shown) {
      play(true)
      const matching = (async () => {
        if (video && shown && playing(shown)) {
          try {
            await videoPlaying
            await catchUp(video, shown)
            return
          } catch {
            // The loop can't play here: the poster stands in.
          }
        }
        await loadPoster()
      })()
      const late = new Promise<void>((resolve) => setTimeout(resolve, HAND_OVER_MS))
      return Promise.race([matching, late])
    },

    draw({ zoom, slot, scale, focal, aspect }) {
      refresh()
      const from = cropToFill(picture.width, picture.height, aspect, picture.focalPoint)
      const to = cropToCard(picture.width, picture.height, picture.focalPoint)
      gl.useProgram(program)
      gl.bindVertexArray(mesh.array)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(at.uMap, 0)
      gl.uniform1f(at.uSlot, slot)
      gl.uniform1f(at.uFocal, focal)
      gl.uniform1f(at.uAspect, aspect)
      gl.uniform1f(at.uScale, scale)
      gl.uniform1f(at.uZoom, zoom)
      gl.uniform4f(at.uFrom, from.scale.x, from.scale.y, from.offset.x, from.offset.y)
      gl.uniform4f(at.uTo, to.scale.x, to.scale.y, to.offset.x, to.offset.y)
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count)
    },

    play,

    destroy() {
      destroyed = true
      if (video) {
        video.pause()
        video.removeAttribute('src')
        video.load()
        video.remove()
      }
      gl.deleteTexture(texture)
      gl.deleteProgram(program)
    },
  }
}
