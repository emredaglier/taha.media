import { createTarget, link, QUAD_VERTEX, uniforms, vertexArray, type Target } from './gl'

/**
 * The composite (#45 "pass 4"; #54): the cards (`scene`) and the Showreel layer (`showreel`), each
 * drawn into its own screen-sized target, put together on the canvas. While the Showreel melts it
 * dissolves in a ring from its centre, the ring bending the picture like the rim of a lens. This is
 * where the liquid-glass material (#55) comes in: it reads the same two targets.
 */
export type Composite = {
  /** What the card pass draws into (with depth). */
  readonly scene: Target
  /** What the Showreel pass draws into. */
  readonly showreel: Target
  resize(width: number, height: number): void
  /** Puts the targets together on the canvas (the default framebuffer, already bound and sized). */
  draw(frame: CompositeFrame): void
  destroy(): void
}

export type CompositeFrame = {
  /** Whether the Showreel layer was drawn this frame. */
  showreelOn: boolean
  /** How far the Showreel has melted, 0 to 1. */
  melt: number
  /** The Showreel's centre on screen (0 to 1, y up) and the distance to its corners, in heights. */
  centre: { x: number; y: number }
  reach: number
  /** The screen's shape (width / height). */
  aspect: number
  /** Seconds, for the ring's wobble. */
  time: number
}

// Value noise, as the prototype's liquid glass has it.
const NOISE = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}`

// Everything is premultiplied: where nothing is drawn, the page colour shows through the canvas
// (playbook: canvas-colours).
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene, uShowreel;
uniform float uShowreelOn, uMelt, uReach, uAspect, uTime;
uniform vec2 uCentre;
out vec4 outColor;
${NOISE}
vec4 showreelAt(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture(uShowreel, uv);
}
void main() {
  vec4 c = texture(uScene, vUv);
  if (uShowreelOn > 0.5) {
    vec4 r;
    if (uMelt <= 0.0) {
      r = texture(uShowreel, vUv);
    } else {
      // The ring grows from the centre past the corners; inside it the Showreel is gone.
      vec2 q = (vUv - uCentre) * vec2(uAspect, 1.0);
      float dist = length(q);
      float radius = uMelt * (uReach + 0.1) - 0.06;
      float wobble = (fbm(q * 8.0 + uTime) - 0.47) * 0.08;
      float off = (dist - radius - wobble) / 0.035;   // (pow() is undefined below 0)
      float ring = exp(-off * off);
      vec2 outward = q / max(dist, 1e-4);
      r = showreelAt(vUv - outward * ring * 0.035);
      r *= smoothstep(radius - 0.01, radius + 0.03, dist + wobble);
      r.rgb += ring * r.a * 0.25;   // the rim catches the light
    }
    c = r + c * (1.0 - r.a);
  }
  outColor = vec4(min(c.rgb, vec3(c.a)), c.a);
}`

export function createComposite(gl: WebGL2RenderingContext): Composite {
  const program = link(gl, QUAD_VERTEX, FRAGMENT)
  const at = uniforms(gl, program, [
    'uScene',
    'uShowreel',
    'uShowreelOn',
    'uMelt',
    'uReach',
    'uAspect',
    'uTime',
    'uCentre',
  ])
  const quad = vertexArray(gl, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]))
  const scene = createTarget(gl, { depth: true })
  const showreel = createTarget(gl, { depth: false })

  return {
    scene,
    showreel,

    resize(width, height) {
      scene.resize(width, height)
      showreel.resize(width, height)
    },

    draw({ showreelOn, melt, centre, reach, aspect, time }) {
      gl.disable(gl.DEPTH_TEST)
      gl.disable(gl.BLEND)
      gl.useProgram(program)
      gl.bindVertexArray(quad.array)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, showreel.texture)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, scene.texture)
      gl.uniform1i(at.uScene, 0)
      gl.uniform1i(at.uShowreel, 1)
      gl.uniform1f(at.uShowreelOn, showreelOn ? 1 : 0)
      gl.uniform1f(at.uMelt, melt)
      gl.uniform1f(at.uReach, reach)
      gl.uniform1f(at.uAspect, aspect)
      gl.uniform1f(at.uTime, time)
      gl.uniform2f(at.uCentre, centre.x, centre.y)
      gl.drawArrays(gl.TRIANGLES, 0, quad.count)
      // Unbound again, so no later pass draws into a texture it is also reading.
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, null)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, null)
    },

    destroy() {
      scene.destroy()
      showreel.destroy()
      quad.destroy()
      gl.deleteProgram(program)
    },
  }
}
