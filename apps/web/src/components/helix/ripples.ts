import { HELIX_TUNING } from '../../lib/helix-tuning'
import { colourTexture, float, link, QUAD_VERTEX, uniforms, vertexArray } from './gl'

/**
 * The water under the liquid glass (#45 "pass 3", #55): a ripple simulation over the screen. The
 * moving cursor (on phones, the finger) drags a line of ripples behind it, turning drops ripples
 * near the top and bottom, and the Showreel's melt starts with one drop at its centre. The
 * composite reads the slopes of the water to bend the picture.
 *
 * It needs half-float render targets. A device without them gets still water: the haze, the colour
 * split and the melt itself work the same, only without ripples.
 */
export type Ripples = {
  /** The water's height now (red) and one step before (green). */
  readonly texture: WebGLTexture
  /** One step across the water, in texture coordinates. */
  readonly texel: { x: number; y: number }
  /** Sizes the water for a canvas this big on screen (CSS px). It starts still. */
  resize(cssWidth: number, cssHeight: number): void
  /** Runs the water on by `dt` seconds. */
  step(input: RippleInput): void
  destroy(): void
}

/** A point on the screen, 0 to 1 across (left to right) and up (bottom to top). */
export type ScreenPoint = { x: number; y: number }

export type RippleInput = {
  dt: number
  /**
   * Where the cursor went since the last step and how fast it moved (CSS px per second); null
   * while there is no pointer over the Helix.
   */
  cursor: { from: ScreenPoint; to: ScreenPoint; speed: number } | null
  /** Where the Showreel starts to melt, on the frame it does; otherwise null. */
  meltAt: ScreenPoint | null
  /** How fast the Helix turns, 0 to 1. */
  speed: number
  /** The screen's shape (width / height). */
  aspect: number
}

const WATER = HELIX_TUNING.water
/** The most steps one frame runs: a stalled tab doesn't run the water on for seconds. */
const MAX_STEPS = 4
/** The water's height is kept within this, either way. */
const MAX_HEIGHT = 4
/** How many water cells cover the screen's height at most, and the screen px per cell. */
const MAX_ROWS = 320
const PX_PER_ROW = 2.5
/** A drop as the Helix turns lands within this share of the screen's height from the top or bottom. */
const STIR_REACH = 0.25
/** Somewhere off the water: a drop or line there does nothing. */
const NOWHERE = -9

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uState;
uniform vec2 uTexel, uFrom, uTo, uDrop;
uniform float uLine, uDropStrength, uAspect;
out vec4 outColor;
const float RADIUS = ${float(WATER.dropRadius)};
const float DAMPING = ${float(WATER.damping)};
// The distance from p to the segment a-b, in screen heights.
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 s = vec2(uAspect, 1.0);
  vec2 pa = (p - a) * s, ba = (b - a) * s;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}
void main() {
  vec4 s = texture(uState, vUv);
  float around = texture(uState, vUv + vec2(uTexel.x, 0.0)).r + texture(uState, vUv - vec2(uTexel.x, 0.0)).r
               + texture(uState, vUv + vec2(0.0, uTexel.y)).r + texture(uState, vUv - vec2(0.0, uTexel.y)).r;
  float next = (around * 0.5 - s.g) * DAMPING;
  float d = segment(vUv, uFrom, uTo);
  next += uLine * exp(-d * d / (RADIUS * RADIUS));
  vec2 p = (vUv - uDrop) * vec2(uAspect, 1.0);
  next += uDropStrength * exp(-dot(p, p) / (RADIUS * RADIUS * 9.0));
  outColor = vec4(clamp(next, -${float(MAX_HEIGHT)}, ${float(MAX_HEIGHT)}), s.r, 0.0, 1.0);
}`

/** A half-float texture and the framebuffer that draws into it. */
function waterTarget(gl: WebGL2RenderingContext, width: number, height: number) {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const framebuffer = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return {
    texture,
    framebuffer,
    complete,
    destroy() {
      gl.deleteTexture(texture)
      gl.deleteFramebuffer(framebuffer)
    },
  }
}

export function createRipples(gl: WebGL2RenderingContext): Ripples {
  const canFloat =
    gl.getExtension('EXT_color_buffer_float') !== null ||
    gl.getExtension('EXT_color_buffer_half_float') !== null
  const program = link(gl, QUAD_VERTEX, FRAGMENT)
  const at = uniforms(gl, program, [
    'uState',
    'uTexel',
    'uFrom',
    'uTo',
    'uDrop',
    'uLine',
    'uDropStrength',
    'uAspect',
  ])
  const quad = vertexArray(gl, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]))
  const still = colourTexture(gl, new Uint8Array([0, 0, 0, 0]))
  let targets: ReturnType<typeof waterTarget>[] = []
  let size = { width: 1, height: 1 }
  let owed = 0
  // What the cursor did since the last step, kept until a step runs (a frame may run none).
  let cursor: RippleInput['cursor'] = null
  let meltAt: ScreenPoint | null = null

  const free = () => {
    for (const target of targets) target.destroy()
    targets = []
  }

  /** One step: from the current water into the other target, then they swap. */
  function advance(
    aspect: number,
    line: RippleInput['cursor'],
    drop: ScreenPoint | null,
    speed: number,
  ) {
    const [from, to] = targets as [ReturnType<typeof waterTarget>, ReturnType<typeof waterTarget>]
    // The Showreel's drop, or now and then one stirred up by turning, near the top or bottom.
    let dropAt: ScreenPoint = { x: NOWHERE, y: NOWHERE }
    let dropStrength = 0
    if (drop) {
      dropAt = drop
      dropStrength = -WATER.meltDrop
    } else if (Math.random() < speed * WATER.stirChance) {
      const reach = Math.random() * STIR_REACH
      dropAt = { x: Math.random(), y: Math.random() < 0.5 ? reach : 1 - reach }
      dropStrength = -WATER.stirDrop * speed
    }
    const push = line
      ? -Math.min(1, line.speed / WATER.cursorFullSpeed) *
        WATER.cursorPush *
        HELIX_TUNING.glass.cursorRipples
      : 0
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.framebuffer)
    gl.viewport(0, 0, size.width, size.height)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, from.texture)
    gl.uniform1i(at.uState, 0)
    gl.uniform2f(at.uTexel, 1 / size.width, 1 / size.height)
    gl.uniform2f(at.uFrom, line?.from.x ?? NOWHERE, line?.from.y ?? NOWHERE)
    gl.uniform2f(at.uTo, line?.to.x ?? NOWHERE, line?.to.y ?? NOWHERE)
    gl.uniform1f(at.uLine, push)
    gl.uniform2f(at.uDrop, dropAt.x, dropAt.y)
    gl.uniform1f(at.uDropStrength, dropStrength)
    gl.uniform1f(at.uAspect, aspect)
    gl.drawArrays(gl.TRIANGLES, 0, quad.count)
    targets = [to, from]
  }

  return {
    get texture() {
      return targets[0]?.texture ?? still
    },

    get texel() {
      return { x: 1 / size.width, y: 1 / size.height }
    },

    resize(cssWidth, cssHeight) {
      free()
      const height = Math.max(8, Math.min(MAX_ROWS, Math.round(cssHeight / PX_PER_ROW)))
      size = {
        width: Math.max(8, Math.round((height * cssWidth) / Math.max(1, cssHeight))),
        height,
      }
      if (!canFloat) return
      targets = [waterTarget(gl, size.width, size.height), waterTarget(gl, size.width, size.height)]
      // Still water after all where half floats can't be drawn into.
      if (!targets.every((target) => target.complete)) free()
    },

    step(input) {
      if (targets.length < 2) return
      if (input.cursor) {
        cursor = cursor
          ? {
              from: cursor.from,
              to: input.cursor.to,
              speed: Math.max(cursor.speed, input.cursor.speed),
            }
          : input.cursor
      }
      meltAt = input.meltAt ?? meltAt
      owed = Math.min(owed + input.dt * WATER.stepsPerSecond, MAX_STEPS)
      if (owed < 1) return
      gl.disable(gl.DEPTH_TEST)
      gl.disable(gl.BLEND)
      gl.useProgram(program)
      gl.bindVertexArray(quad.array)
      for (; owed >= 1; owed--) {
        advance(input.aspect, cursor, meltAt, input.speed)
        cursor = null
        meltAt = null
      }
      gl.bindTexture(gl.TEXTURE_2D, null)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    },

    destroy() {
      free()
      gl.deleteTexture(still)
      quad.destroy()
      gl.deleteProgram(program)
    },
  }
}
