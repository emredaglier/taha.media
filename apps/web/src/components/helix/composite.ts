import { HELIX_TUNING } from '../../lib/helix-tuning'
import { createTarget, float, link, QUAD_VERTEX, uniforms, vertexArray, type Target } from './gl'

/**
 * The composite (#45 "pass 4"): the cards (`scene`) and the Showreel layer (`showreel`), each
 * drawn into its own screen-sized target, put together on the canvas through the liquid glass
 * (#55), the one melt material that does every job:
 * - The picture stays whole but warps, as through water and heat haze, with a colour split. The
 *   ripples (`Ripples`) bend it, and turning stirs the haze.
 * - How melted each pixel is comes from one measure: the top and bottom of the screen beyond the
 *   sharp band, cards deep in the Helix, cards you aren't pointing at, and cards that haven't
 *   appeared yet (or are leaving the visible band). The more melted, the more it warps and blurs,
 *   until it is gone and the page shows through. The card you point at doesn't melt at the edges
 *   or for depth.
 * - The Showreel melts away in a ring from its centre, the ring bending the picture like the rim
 *   of a lens.
 * The card pass writes what the measure needs for each pixel into the scene's second picture
 * (`meta`): red, how far the card is not there; green, not pointed at; blue, pointed at; alpha,
 * how deep in the Helix it is.
 */
export type Composite = {
  /** What the card pass draws into (with depth, and the measure's picture as a second output). */
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
  /** Seconds, for the haze and the ring's wobble. */
  time: number
  /** How fast the Helix turns, 0 to 1: it stirs the haze. */
  speed: number
  /** How far the Helix has turned, in screen heights, so the haze rides with the cards. */
  shift: number
  /** The water's height (red), and one step across it in texture coordinates. */
  ripples: { texture: WebGLTexture; texel: { x: number; y: number } }
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

// The owner's values are in the tuning object; the rest is the prototype's liquid glass as it is.
const RING = HELIX_TUNING.meltRing
const GLASS = HELIX_TUNING.glass

// Everything is premultiplied: where the picture has melted away, or nothing is drawn, the page
// colour shows through the canvas (playbook: canvas-colours), so it never reads a CSS colour.
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene, uMeta, uShowreel, uRipples;
uniform vec2 uRippleTexel, uCentre;
uniform float uShowreelOn, uMelt, uReach, uAspect, uTime, uSpeed, uShift;
out vec4 outColor;
const float SHARP_BAND = ${float(HELIX_TUNING.sharpBand)};
const float FAR_CARDS = ${float(HELIX_TUNING.farCards)};
const float NOT_POINTED_AT = ${float(HELIX_TUNING.notPointedAt)};
const float RIPPLE_STRENGTH = ${float(GLASS.rippleStrength)};
const float HAZE_SPEED = ${float(GLASS.hazeSpeed)};
const float COLOUR_SPLIT = ${float(GLASS.colourSplit)};
const float RING_WIDTH = ${float(RING.width)};
const float RING_PUSH = ${float(RING.push)};
const float RING_RIM = ${float(RING.rim)};
const float RING_WOBBLE = ${float(RING.wobble)};
const float RING_REACH_MARGIN = ${float(RING.reachMargin)};
${NOISE}
// How melted the picture is at uv: 0 sharp, 1 gone.
float meltAt(vec2 uv) {
  vec4 m = texture(uMeta, uv);
  float keep = 1.0 - m.b;   // the card pointed at keeps its edges and its depth
  float edge = pow(smoothstep(SHARP_BAND, 1.0, abs(uv.y - 0.5) * 2.0), 1.65);
  float v = max(edge * keep, m.a * FAR_CARDS * keep);
  v = max(v, m.g * NOT_POINTED_AT);
  v = max(v, m.r);
  return clamp(v, 0.0, 1.0);
}
vec4 sceneAt(vec2 uv, float lod) { return textureLod(uScene, clamp(uv, 0.001, 0.999), lod); }
vec4 showreelAt(vec2 uv, float lod) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return textureLod(uShowreel, uv, lod);
}
void main() {
  vec2 uv = vUv;
  // The water's slope bends the picture; the haze drifts up and rides with the cards.
  vec2 t = uRippleTexel;
  vec2 n = vec2(texture(uRipples, uv + vec2(t.x, 0.0)).r - texture(uRipples, uv - vec2(t.x, 0.0)).r,
                texture(uRipples, uv + vec2(0.0, t.y)).r - texture(uRipples, uv - vec2(0.0, t.y)).r);
  float m = meltAt(uv);
  vec2 q = (uv - vec2(0.0, uShift)) * vec2(uAspect, 1.0);
  float drift = uTime * HAZE_SPEED;
  vec2 haze = vec2(fbm(q * vec2(2.0, 4.0) + vec2(0.0, -drift)),
                   fbm(q * vec2(2.0, 4.0) + vec2(5.2, -drift * 1.2))) - 0.47;
  vec2 off = n * RIPPLE_STRENGTH * 0.25 + haze * m * 0.07 * (1.0 + uSpeed * 2.0);
  // The colours split where it bends, and it blurs as it melts.
  float split = COLOUR_SPLIT * 0.006 * (m + length(n) * 6.0);
  float lod = m * 2.5;
  vec4 red = sceneAt(uv + off + vec2(split, 0.0), lod);
  vec4 green = sceneAt(uv + off, lod);
  vec4 blue = sceneAt(uv + off - vec2(split, 0.0), lod);
  vec4 c = vec4(red.r, green.g, blue.b, max(green.a, max(red.a, blue.a)));
  // The light catches the ripples' slopes, on the cards.
  vec3 normal = normalize(vec3(-n * RIPPLE_STRENGTH * 12.0, 1.0));
  c.rgb += pow(clamp(dot(normal, normalize(vec3(0.4, 0.6, 1.0))), 0.0, 1.0), 60.0) * 0.35 * c.a;
  // Melted far enough, it is gone.
  c *= 1.0 - smoothstep(0.55, 1.0, m);
  if (uShowreelOn > 0.5) {
    vec4 r;
    if (uMelt <= 0.0) {
      r = texture(uShowreel, uv);
    } else {
      // The ring grows from the centre past the corners; inside it the Showreel is gone.
      vec2 rq = (uv - uCentre) * vec2(uAspect, 1.0);
      float dist = length(rq);
      float radius = uMelt * (uReach + RING_REACH_MARGIN) - 0.06;
      float wobble = (fbm(rq * 8.0 + uTime) - 0.47) * RING_WOBBLE;
      float o = (dist - radius - wobble) / RING_WIDTH;   // (pow() is undefined below 0)
      float ring = exp(-o * o);
      vec2 outward = rq / max(dist, 1e-4);
      r = showreelAt(uv - outward * ring * RING_PUSH + off * uMelt, ring * 2.0);
      r *= smoothstep(radius - 0.01, radius + 0.03, dist + wobble);
      r.rgb += ring * r.a * RING_RIM;   // the rim catches the light
    }
    c = r + c * (1.0 - r.a);
  }
  outColor = vec4(min(c.rgb, vec3(c.a)), c.a);
}`

/** The texture units the composite reads from. */
const UNITS = { scene: 0, meta: 1, showreel: 2, ripples: 3 }

export function createComposite(gl: WebGL2RenderingContext): Composite {
  const program = link(gl, QUAD_VERTEX, FRAGMENT)
  const at = uniforms(gl, program, [
    'uScene',
    'uMeta',
    'uShowreel',
    'uRipples',
    'uRippleTexel',
    'uShowreelOn',
    'uMelt',
    'uReach',
    'uAspect',
    'uTime',
    'uSpeed',
    'uShift',
    'uCentre',
  ])
  const quad = vertexArray(gl, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]))
  // Both are read blurred where the picture melts, so they keep mipmaps.
  const scene = createTarget(gl, { depth: true, meta: true, mipmaps: true })
  const showreel = createTarget(gl, { depth: false, mipmaps: true })

  const bind = (unit: number, texture: WebGLTexture | null) => {
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, texture)
  }

  return {
    scene,
    showreel,

    resize(width, height) {
      scene.resize(width, height)
      showreel.resize(width, height)
    },

    draw({ showreelOn, melt, centre, reach, aspect, time, speed, shift, ripples }) {
      gl.disable(gl.DEPTH_TEST)
      gl.disable(gl.BLEND)
      gl.useProgram(program)
      gl.bindVertexArray(quad.array)
      bind(UNITS.scene, scene.texture)
      bind(UNITS.meta, scene.meta)
      bind(UNITS.showreel, showreel.texture)
      bind(UNITS.ripples, ripples.texture)
      gl.uniform1i(at.uScene, UNITS.scene)
      gl.uniform1i(at.uMeta, UNITS.meta)
      gl.uniform1i(at.uShowreel, UNITS.showreel)
      gl.uniform1i(at.uRipples, UNITS.ripples)
      gl.uniform2f(at.uRippleTexel, ripples.texel.x, ripples.texel.y)
      gl.uniform1f(at.uShowreelOn, showreelOn ? 1 : 0)
      gl.uniform1f(at.uMelt, melt)
      gl.uniform1f(at.uReach, reach)
      gl.uniform1f(at.uAspect, aspect)
      gl.uniform1f(at.uTime, time)
      gl.uniform1f(at.uSpeed, speed)
      gl.uniform1f(at.uShift, shift)
      gl.uniform2f(at.uCentre, centre.x, centre.y)
      gl.drawArrays(gl.TRIANGLES, 0, quad.count)
      // Unbound again, so no later pass draws into a texture it is also reading.
      for (const unit of [UNITS.ripples, UNITS.showreel, UNITS.meta, UNITS.scene]) bind(unit, null)
    },

    destroy() {
      scene.destroy()
      showreel.destroy()
      quad.destroy()
      gl.deleteProgram(program)
    },
  }
}
