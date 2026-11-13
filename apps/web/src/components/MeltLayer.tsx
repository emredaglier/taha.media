'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'

import { deviceReport, isWeakDevice } from '../lib/weak-device'
import { CAN_HOVER, POINTER_FINE, REDUCED_MOTION, subscribeToPreferences } from '../lib/loop-mode'
import { MELT, settled, springStep, visibleRect, type Rect, type Spring } from '../lib/melt'

const wanted = () =>
  matchMedia(`${CAN_HOVER} and ${POINTER_FINE}`).matches &&
  !matchMedia(REDUCED_MOTION).matches &&
  typeof WebGL2RenderingContext !== 'undefined' &&
  !isWeakDevice(deviceReport())

/** Only a real mouse melts. */
const real = (event: PointerEvent) => event.isTrusted && event.pointerType === 'mouse'

const VERTEX = `#version 300 es
in vec2 aPos;
uniform vec2 uView;
void main() {
  vec2 c = aPos / uView * 2. - 1.;
  gl_Position = vec4(c.x, -c.y, 0., 1.);
}`

// The Melt map of the design prototype: a point inside the circle samples `shift` px higher, per
// column of the circle, fading to nothing at the rim; red, green and blue by their own strength.
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uMouse;
uniform vec4 uBox;
uniform vec4 uCrop;
uniform vec3 uShift;
uniform float uSize;
uniform float uDpr;
uniform float uHeight;
uniform float uDrips[${MELT.columns}];
out vec4 outColour;
vec4 at(vec2 p, float shift) {
  vec2 uv = uCrop.xy + uCrop.zw * clamp((vec2(p.x, p.y - shift) - uBox.xy) / uBox.zw, 0., 1.);
  // The slope of the plain picture, so the jumps between columns don't pick a blurry mip level.
  vec2 step = uCrop.zw / uBox.zw;
  return textureGrad(uTex, uv, vec2(step.x, 0.), vec2(0., step.y));
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, uHeight - gl_FragCoord.y) / uDpr;
  vec2 d = (p - uMouse) / (uSize * .5);
  float r2 = dot(d, d);
  if (r2 >= 1.) discard;
  int column = clamp(int(floor((d.x + 1.) * .5 * float(${MELT.columns}))), 0, ${MELT.columns - 1});
  float drip = uDrips[column] * (1. - d.x * d.x) * (1. - r2) * .5;
  // A video read into WebGL comes out a shade off the browser's own drawing of it, so the patch
  // fades out toward the rim (where nothing is bent anyway) instead of ending in a visible edge.
  float cover = smoothstep(1., .6, r2);
  outColour = vec4(vec3(at(p, uShift.x * drip).r, at(p, uShift.y * drip).g, at(p, uShift.z * drip).b) * cover, cover);
}`

type Source = { texture: WebGLTexture; width: number; height: number; time: number }
type Part = { source: Source; box: DOMRect; crop: Rect; area: Rect; link: boolean }

const percent = (value: string | undefined) =>
  value?.endsWith('%') ? parseFloat(value) / 100 : 0.5

/**
 * Pictures and Preview loops melt under the mouse (#122): the cursor's drip effect, drawn in WebGL
 * only over media (`data-melt`), never text. A fixed canvas draws the media under the mouse again
 * at its exact box, bent around the mouse, covering the original; elsewhere it stays clear.
 * Decorative. Same gate as `SiteCursor`, plus WebGL2 and a device that isn't weak.
 * shortcut: mounted from PageMain like `SiteCursor`; media inside a scroll container or under an
 * overlapping element is drawn unclipped, move the layer into the page if that ever shows.
 */
export function MeltLayer() {
  const enabled = useSyncExternalStore(subscribeToPreferences, wanted, () => false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const gl = enabled && canvas ? canvas.getContext('webgl2', { antialias: false }) : null
    if (!canvas || !gl) return
    const root = document.documentElement

    const compile = (type: number, code: string) => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, code)
      gl.compileShader(shader)
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null
    }
    const vertex = compile(gl.VERTEX_SHADER, VERTEX)
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT)
    const program = gl.createProgram()
    if (!vertex || !fragment || !program) return
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    gl.useProgram(program)

    const uniform = (name: string) => gl.getUniformLocation(program, name)
    const view = uniform('uView')
    const box = uniform('uBox')
    const crop = uniform('uCrop')
    const mouse = uniform('uMouse')
    const shift = uniform('uShift')
    const dpr = uniform('uDpr')
    const height = uniform('uHeight')
    gl.uniform1i(uniform('uTex'), 0)
    gl.uniform1f(uniform('uSize'), MELT.size)
    gl.uniform1fv(
      uniform('uDrips'),
      Float32Array.from({ length: MELT.columns }, () => 0.2 + Math.random() * 0.8),
    )

    const buffer = gl.createBuffer()
    const position = gl.getAttribLocation(program, 'aPos')
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const textures = new Map<HTMLImageElement | HTMLVideoElement, WebGLTexture>()
    const images = new WeakMap<HTMLImageElement, Source | 'loading' | 'bad'>()
    const videos = new WeakMap<HTMLVideoElement, Source | 'bad'>()
    let spring: Spring = { power: 0, speed: 0 }
    let mx = 0
    let my = 0
    let present = false
    let reach = false
    let dead = false
    let last = 0
    let raf = 0

    const newTexture = (el: HTMLImageElement | HTMLVideoElement, mipmap: boolean) => {
      // The layer outlives route changes: media that left the page frees its texture first.
      for (const [old, texture] of textures) {
        if (old.isConnected) continue
        gl.deleteTexture(texture)
        textures.delete(old)
        if (old instanceof HTMLVideoElement) videos.delete(old)
        else images.delete(old)
      }
      const texture = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
      )
      if (texture) textures.set(el, texture)
      return texture
    }

    /** A separate copy, so normal image display never depends on CORS; loaded on first reach. */
    const imageSource = (img: HTMLImageElement): Source | null => {
      const known = images.get(img)
      if (known) return typeof known === 'string' ? null : known
      if (!img.complete || !img.naturalWidth || !img.currentSrc) return null
      images.set(img, 'loading')
      const copy = new Image()
      copy.crossOrigin = 'anonymous'
      copy.onerror = () => images.set(img, 'bad')
      copy.onload = () => {
        if (dead) return
        const texture = newTexture(img, true)
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, copy)
          gl.generateMipmap(gl.TEXTURE_2D)
        } catch {
          images.set(img, 'bad')
          return
        }
        images.set(img, { texture, width: copy.naturalWidth, height: copy.naturalHeight, time: 0 })
        wake()
      }
      // shortcut: the copy stays the size first loaded, even if the srcset picks another one later.
      copy.src = img.currentSrc
      return null
    }

    /** The video's latest frame, uploaded once per new frame. */
    const videoSource = (video: HTMLVideoElement): Source | null => {
      let known = videos.get(video)
      if (known === 'bad' || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null
      if (!video.videoWidth) return null
      known ??= {
        texture: newTexture(video, false),
        width: video.videoWidth,
        height: video.videoHeight,
        time: NaN,
      }
      if (known.time !== video.currentTime) {
        gl.bindTexture(gl.TEXTURE_2D, known.texture)
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
        } catch {
          videos.set(video, 'bad')
          return null
        }
        known.time = video.currentTime
      }
      videos.set(video, known)
      return known
    }

    /** The media in reach of the circle that can be drawn, and whether a loop in reach plays. */
    const gather = () => {
      const half = MELT.size / 2
      const parts: Part[] = []
      let playing = false
      for (const el of document.querySelectorAll<HTMLImageElement | HTMLVideoElement>(
        '[data-melt]',
      )) {
        if (el.closest('[aria-modal]')) continue
        const rect = el.getBoundingClientRect()
        const area = {
          x: Math.max(rect.left, mx - half),
          y: Math.max(rect.top, my - half),
          w: 0,
          h: 0,
        }
        area.w = Math.min(rect.right, mx + half) - area.x
        area.h = Math.min(rect.bottom, my + half) - area.y
        if (area.w <= 0 || area.h <= 0) continue
        const video = el instanceof HTMLVideoElement
        if (video && !el.paused) playing = true
        const source = video ? videoSource(el) : imageSource(el)
        if (!source) continue
        const style = getComputedStyle(el)
        const [x, y] = style.objectPosition.split(' ')
        const visible = visibleRect(rect, source, style.objectFit, { x: percent(x), y: percent(y) })
        if (!visible) continue
        const inside = mx >= rect.left && mx <= rect.right && my >= rect.top && my <= rect.bottom
        parts.push({
          source,
          box: rect,
          crop: visible,
          area,
          link: inside && el.closest('a[href]') !== null,
        })
      }
      return { parts, playing }
    }

    const fit = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(root.clientWidth * ratio)
      canvas.height = Math.round(root.clientHeight * ratio)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(view, root.clientWidth, root.clientHeight)
      gl.uniform1f(dpr, canvas.width / root.clientWidth)
      gl.uniform1f(height, canvas.height)
    }

    const clear = () => {
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }

    const frame = (now: number) => {
      raf = 0
      if (dead) return
      // The mouse left while this frame was queued.
      if (!present) return clear()
      const dt = Math.min((now - last) / 1000, 1 / 30)
      last = now
      // The room has its own pointer effect.
      const { parts, playing } =
        root.dataset.home === 'room' ? { parts: [], playing: false } : gather()
      clear()
      reach = parts.length > 0
      if (!reach) {
        spring = { power: 0, speed: 0 }
        // A loop in reach that has no frame yet is picked up by the next mouse or scroll event.
        if (playing && present) raf = requestAnimationFrame(frame)
        return
      }
      const to = parts.some((part) => part.link) ? MELT.link : MELT.rest
      spring = springStep(spring, to, dt)
      gl.uniform2f(mouse, mx, my)
      gl.uniform3f(
        shift,
        spring.power * (1 - MELT.split),
        spring.power,
        spring.power * (1 + MELT.split),
      )
      for (const { source, box: b, crop: c, area: a } of parts) {
        gl.bindTexture(gl.TEXTURE_2D, source.texture)
        gl.uniform4f(box, b.left, b.top, b.width, b.height)
        gl.uniform4f(crop, c.x, c.y, c.w, c.h)
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([a.x, a.y, a.x + a.w, a.y, a.x, a.y + a.h, a.x + a.w, a.y + a.h]),
          gl.DYNAMIC_DRAW,
        )
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }
      // No work while the mouse rests and the spring has settled; a playing loop needs new frames.
      if (!settled(spring, to) || playing) raf = requestAnimationFrame(frame)
    }
    function wake() {
      if (raf || dead || !present) return
      last = performance.now() - 16
      raf = requestAnimationFrame(frame)
    }
    const hide = () => {
      present = false
      clear()
    }
    const track = (event: PointerEvent) => {
      if (!real(event)) return
      if (event.target instanceof HTMLIFrameElement) return hide()
      present = true
      mx = event.clientX
      my = event.clientY
      wake()
    }
    const press = (event: PointerEvent) => {
      if (!real(event)) return
      if (event.type === 'pointerdown' && reach) spring.speed += MELT.kick
      wake()
    }
    const leave = (event: PointerEvent) => {
      if (real(event) && !event.relatedTarget) hide()
    }
    const resize = () => {
      fit()
      wake()
    }
    // A lost context turns the layer off quietly; the page stays as it was.
    const off = () => {
      dead = true
      cancelAnimationFrame(raf)
    }

    fit()
    canvas.addEventListener('webglcontextlost', off)
    document.addEventListener('pointermove', track)
    document.addEventListener('pointerover', track)
    document.addEventListener('pointerout', leave)
    document.addEventListener('pointerdown', press)
    window.addEventListener('scroll', wake, { passive: true })
    window.addEventListener('resize', resize)
    return () => {
      dead = true
      cancelAnimationFrame(raf)
      canvas.removeEventListener('webglcontextlost', off)
      document.removeEventListener('pointermove', track)
      document.removeEventListener('pointerover', track)
      document.removeEventListener('pointerout', leave)
      document.removeEventListener('pointerdown', press)
      window.removeEventListener('scroll', wake)
      window.removeEventListener('resize', resize)
      for (const texture of textures.values()) gl.deleteTexture(texture)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
    }
  }, [enabled])

  if (!enabled) return null
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[30] size-full"
    />
  )
}
