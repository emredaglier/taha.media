import { HEAT_AT_REST, planHeat, type HeatCarry, type PointerPath } from '../../lib/helix-heat'
import { HELIX_TUNING } from '../../lib/helix-tuning'
import { colourTexture, float, link, QUAD_VERTEX, screenQuad, uniforms } from './gl'

/**
 * The cursor's heat trail (#45 "pass 3", #64): the moving cursor (on phones, the finger) leaves
 * heat along its path, which spreads and fades. The analogue signal reads it to bump the tracking
 * and jitter the lines where the cursor passes.
 *
 * It needs half-float render targets. A device without them gets no trail: the signal, its
 * jitter from turning and the melt itself work the same, only the cursor leaves nothing.
 */
export type HeatTrail = {
  /** The heat now (red), 0 where the cursor hasn't been. */
  readonly texture: WebGLTexture
  /** Sizes the trail for a screen this shape (width / height). It starts cold. */
  resize(aspect: number): void
  /** Runs the trail on by `dt` seconds; `cursor` is the pointer's path since the last frame. */
  step(dt: number, cursor: PointerPath | null, aspect: number): void
  destroy(): void
}

const HEAT = HELIX_TUNING.heat
/** How many cells cover the screen's height (the prototype's), whatever its size. */
const ROWS = 160
/** The most cells across: a canvas with next to no height doesn't ask for a huge texture. */
const MAX_COLUMNS = 2048
/** The heat is kept below this, however long the cursor circles one place. */
const MAX_HEAT = 1.5
/** Somewhere off the trail: a splat there does nothing. */
const NOWHERE = -9

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uState;
uniform vec2 uTexel, uFrom, uTo;
uniform float uStrength, uAspect;
out vec4 outColor;
const float RADIUS = ${float(HEAT.radius)};
const float DECAY = ${float(HEAT.decay)};
// The distance from p to the segment a-b, in screen heights.
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 s = vec2(uAspect, 1.0);
  vec2 pa = (p - a) * s, ba = (b - a) * s;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}
void main() {
  // It spreads to the neighbours and fades, then the cursor's path adds to it.
  float around = texture(uState, vUv).r * 4.0
    + texture(uState, vUv + vec2(uTexel.x, 0.0)).r + texture(uState, vUv - vec2(uTexel.x, 0.0)).r
    + texture(uState, vUv + vec2(0.0, uTexel.y)).r + texture(uState, vUv - vec2(0.0, uTexel.y)).r;
  float heat = around / 8.0 * DECAY;
  float d = segment(vUv, uFrom, uTo);
  heat += uStrength * exp(-d * d / (RADIUS * RADIUS));
  outColor = vec4(min(heat, ${float(MAX_HEAT)}), 0.0, 0.0, 1.0);
}`

/** One state of the trail: a half-float texture and the framebuffer that draws into it. */
type State = ReturnType<typeof stateTarget>

function stateTarget(gl: WebGL2RenderingContext, width: number, height: number) {
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
  // Unbound again, so no later pass draws into it while it is still bound for reading.
  gl.bindTexture(gl.TEXTURE_2D, null)
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

export function createHeatTrail(gl: WebGL2RenderingContext): HeatTrail {
  const canFloat =
    gl.getExtension('EXT_color_buffer_float') !== null ||
    gl.getExtension('EXT_color_buffer_half_float') !== null
  const program = link(gl, QUAD_VERTEX, FRAGMENT)
  const at = uniforms(gl, program, ['uState', 'uTexel', 'uFrom', 'uTo', 'uStrength', 'uAspect'])
  const quad = screenQuad(gl)
  const cold = colourTexture(gl, new Uint8Array([0, 0, 0, 0]))
  let targets: State[] = []
  let size = { width: 1, height: 1 }
  let carry: HeatCarry = HEAT_AT_REST

  const free = () => {
    for (const target of targets) target.destroy()
    targets = []
  }

  return {
    get texture() {
      return targets[0]?.texture ?? cold
    },

    resize(aspect) {
      free()
      carry = HEAT_AT_REST
      size = { width: Math.min(MAX_COLUMNS, Math.max(8, Math.round(ROWS * aspect))), height: ROWS }
      if (!canFloat) return
      targets = [stateTarget(gl, size.width, size.height), stateTarget(gl, size.width, size.height)]
      // No trail after all where half floats can't be drawn into.
      if (!targets.every((target) => target.complete)) free()
    },

    step(dt, cursor, aspect) {
      if (targets.length < 2) return
      const plan = planHeat(carry, dt, cursor)
      carry = plan.carry
      if (plan.steps === 0) return
      gl.disable(gl.DEPTH_TEST)
      gl.disable(gl.BLEND)
      gl.useProgram(program)
      gl.bindVertexArray(quad.array)
      gl.viewport(0, 0, size.width, size.height)
      gl.activeTexture(gl.TEXTURE0)
      gl.uniform1i(at.uState, 0)
      gl.uniform2f(at.uTexel, 1 / size.width, 1 / size.height)
      gl.uniform1f(at.uAspect, aspect)
      for (let step = 0; step < plan.steps; step++) {
        // The pointer's heat lands on the first step only.
        const splat = step === 0 ? plan.splat : null
        const [from, to] = targets as [State, State]
        gl.bindFramebuffer(gl.FRAMEBUFFER, to.framebuffer)
        gl.bindTexture(gl.TEXTURE_2D, from.texture)
        gl.uniform2f(at.uFrom, splat?.from.x ?? NOWHERE, splat?.from.y ?? NOWHERE)
        gl.uniform2f(at.uTo, splat?.to.x ?? NOWHERE, splat?.to.y ?? NOWHERE)
        gl.uniform1f(at.uStrength, splat?.strength ?? 0)
        gl.drawArrays(gl.TRIANGLES, 0, quad.count)
        targets = [to, from]
      }
      gl.bindTexture(gl.TEXTURE_2D, null)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    },

    destroy() {
      free()
      gl.deleteTexture(cold)
      quad.destroy()
      gl.deleteProgram(program)
    },
  }
}
