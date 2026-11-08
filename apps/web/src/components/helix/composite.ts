import { HELIX_TUNING } from '../../lib/helix-tuning'
import { createTarget, float, link, QUAD_VERTEX, screenQuad, uniforms, type Target } from './gl'

/**
 * The composite (#45 "pass 4"): the cards (`scene`) and the Showreel layer (`showreel`), each
 * drawn into its own screen-sized target, put together on the canvas through the analogue signal
 * (#64), the one melt material that does every job:
 * - A signal failing: rows of the picture jump sideways, the colours bleed apart, a tracking band
 *   rolls down the screen and tape noise comes up. Turning raises the jitter, and the cursor's
 *   heat trail (`HeatTrail`) bumps the tracking where it passes.
 * - How melted each pixel is comes from one measure (`meltAt`): the top and bottom of the screen
 *   beyond the sharp band, cards deep in the Helix, cards not hovered, and cards that haven't
 *   appeared yet (or are leaving the visible band). The more melted, the more it tears, until it
 *   is gone and the page shows through. The hovered card doesn't melt at the edges or for depth.
 * - Sharp cards (the hovered one, the ones in the sharp band) keep straight top and bottom edges;
 *   their left and right edges shift row by row (Scanline edges). Everything else tears along
 *   its outline too.
 * - The Showreel drops out line by line behind a jittering ring that grows from its centre.
 * The card pass writes what the measure needs for each pixel as the scene's melt inputs
 * (`MELT_INPUTS_GLSL`).
 */
export type Composite = {
  /** What the card pass draws into (with depth, and the melt inputs as a second output). */
  readonly scene: Target
  /** What the Showreel pass draws into. */
  readonly showreel: Target
  resize(width: number, height: number): void
  /** Puts the targets together on the canvas (the default framebuffer, already bound and sized). */
  draw(frame: CompositeFrame): void
  destroy(): void
}

/**
 * The melt inputs, as GLSL for both the card pass, which writes them as its second output, and the
 * composite, which reads them: for each pixel, how far the card there is not there yet (or is
 * leaving the visible band), not hovered, hovered, and deep in the Helix, each 0 to 1. One packing,
 * so the two passes can't disagree about which channel holds what.
 */
export const MELT_INPUTS_GLSL = `
struct MeltInputs { float gone; float dimmed; float hovered; float deep; };
vec4 packMeltInputs(MeltInputs m) { return vec4(m.gone, m.dimmed, m.hovered, m.deep); }
MeltInputs unpackMeltInputs(vec4 v) { return MeltInputs(v.r, v.g, v.b, v.a); }`

/**
 * How much a card deep in the Helix fades (colour and alpha × (1 - DEEP_FADE × deep), the
 * prototype's light haze). The card pass leaves it to the composite, so the scene's alpha stays
 * the cards' coverage, which the outline is traced from.
 */
const DEEP_FADE = 0.35

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
  /** Seconds, for the jitter, the tracking band and the noise. */
  time: number
  /** How fast the Helix turns, 0 to 1: it raises the jitter. */
  speed: number
  /** How far the Helix has turned, in screen heights (`turnOnScreen`): the outline follows it. */
  shift: number
  /** The cursor's heat trail (`HeatTrail`; red). */
  heat: WebGLTexture
}

// Value noise, as the prototype has it.
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

// The cards' outline, as the prototype's EDGE chunk has it (the parts the signal reads): the card
// coverage around the pixel at 17 taps, two rings of 8 at about r and r/2 px. `mean` is the
// blurred coverage (0 outside, 1 inside, 0.5 on the outline), `band` 1 on the outline and 0 well
// inside or outside, `dir` the way into the card, and `jit` a small displacement, strongest on
// the outline, anchored to the turning cards.
const EDGE = `
struct Edge { float band; float mean; vec2 dir; vec2 jit; };
Edge edgeAt(vec2 uv) {
  vec2 px = 1.0 / uRes;
  float r = clamp(uRes.y / 150.0, 4.0, 12.0);
  float acc = coverAt(uv);
  float wsum = 1.0;
  vec2 g = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398 + 0.3927;
    vec2 d = vec2(cos(a), sin(a));
    float c1 = coverAt(uv + d * px * r);
    float c2 = coverAt(uv + d * px * r * 0.5);
    acc += c1 + c2 * 1.5;
    wsum += 2.5;
    g += d * (c1 + c2 * 1.5);
  }
  Edge e;
  e.mean = acc / wsum;
  e.band = 1.0 - pow(abs(2.0 * e.mean - 1.0), 1.6);
  e.dir = g / max(length(g), 1e-3);
  vec2 p = (uv - vec2(0.0, uShift)) * uRes / 11.0;
  vec2 n = vec2(fbm(p * 0.8) * 0.7 + vnoise(p * 4.0) * 0.3, fbm(p * 0.8 + 41.3));
  e.jit = (n - 0.5) * 2.0 * e.band * px * r * 0.9;
  return e;
}`

// The owner's values are in the tuning object; the rest is the prototype's signal as it is.
const SIGNAL = HELIX_TUNING.signal
const RING = HELIX_TUNING.meltRing

// Everything is premultiplied: where the picture has melted away, or nothing is drawn, the page
// colour shows through the canvas (playbook: canvas-colours), so it never reads a CSS colour. The
// prototype's fades towards the background colour are fades of colour and alpha together here,
// and its noise and grey are scaled by alpha, so none shows where no card is.
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene, uMeltInputs, uShowreel, uHeat;
uniform vec2 uRes, uCentre;
uniform float uShowreelOn, uMelt, uReach, uAspect, uTime, uSpeed, uShift;
out vec4 outColor;
const float SHARP_BAND = ${float(HELIX_TUNING.sharpBand)};
const float FAR_CARDS = ${float(HELIX_TUNING.farCards)};
const float NOT_HOVERED = ${float(HELIX_TUNING.notHovered)};
const float LINE_JITTER = ${float(SIGNAL.lineJitter)};
const float CHROMA_BLEED = ${float(SIGNAL.chromaBleed)};
const float TAPE_NOISE = ${float(SIGNAL.tapeNoise)};
const float CURSOR_BUMP = ${float(SIGNAL.cursorBump)};
const float SCANLINE_EDGE = ${float(SIGNAL.scanlineEdge)};
const float DEEP_FADE = ${float(DEEP_FADE)};
const float RING_WIDTH = ${float(RING.width)};
const float RING_DEPTH = ${float(RING.depth)};
const float RING_REACH_MARGIN = ${float(RING.reachMargin)};
${NOISE}
${MELT_INPUTS_GLSL}
// How melted the picture is at uv: 0 sharp, 1 gone.
float meltAt(vec2 uv) {
  MeltInputs m = unpackMeltInputs(texture(uMeltInputs, uv));
  float keep = 1.0 - m.hovered;   // the hovered card keeps its edges and its depth
  float edge = pow(smoothstep(SHARP_BAND, 1.0, abs(uv.y - 0.5) * 2.0), 1.65);
  float v = max(edge * keep, m.deep * FAR_CARDS * keep);
  v = max(v, m.dimmed * NOT_HOVERED);
  v = max(v, m.gone);
  return clamp(v, 0.0, 1.0);
}
// How much of a card covers uv, 0 to 1: the scene's alpha, which the card pass writes unfaded
// (the picture's own alpha times the coverage; the pictures are opaque).
float coverAt(vec2 uv) { return textureLod(uScene, clamp(uv, 0.001, 0.999), 0.0).a; }
${EDGE}
vec4 sceneAt(vec2 uv, float lod) { return textureLod(uScene, clamp(uv, 0.001, 0.999), lod); }
vec4 showreelAt(vec2 uv, float lod) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return textureLod(uShowreel, uv, lod);
}
void main() {
  vec2 uv = vUv;
  Edge e = edgeAt(uv);
  float heat = texture(uHeat, uv).r;
  float m0 = meltAt(uv);
  float m = clamp(m0 + heat * CURSOR_BUMP * 0.25 * (1.0 - m0), 0.0, 1.0);
  // Rows two pixels tall jump sideways, 14 new jumps a second; the tracking band rolls down.
  float row = floor(uv.y * uRes.y / 2.0);
  float rj = hash12(vec2(row, floor(uTime * 14.0))) - 0.5;
  float tq = (fract(uv.y * 0.6 - uTime * 0.07) - 0.5) / 0.04;
  float trk = exp(-tq * tq);
  // Sharp cards (low melt of the card itself, read a little inside so the pixels just outside
  // agree) get Scanline edges: no outline noise, only a sideways shift per row, about 2 px at rest.
  float mc = max(m, meltAt(uv + e.dir * 10.0 / uRes));
  float sharp = 1.0 - smoothstep(0.0, 0.3, mc);
  float eb = e.band * (1.0 - sharp);
  float scanAmp = sharp * (2.0 + uSpeed * 5.0 + heat * CURSOR_BUMP * 4.0) / uRes.x * SCANLINE_EDGE;
  float amp = (m * 0.07 * (1.0 + uSpeed) + eb * 0.010 + trk * m * 0.04
               + heat * CURSOR_BUMP * 0.015 * (1.0 - sharp)) * LINE_JITTER;
  float j = rj * (amp + 2.0 * scanAmp * LINE_JITTER);
  float ca = (m * 0.012 + eb * 0.002) * CHROMA_BLEED;
  vec2 pos = uv + vec2(j, 0.0) + e.jit * 0.8 * (1.0 - sharp);
  float lod = m * 1.2;
  vec4 red = sceneAt(pos + vec2(ca, 0.0), lod);
  vec4 green = sceneAt(pos, lod);
  vec4 blue = sceneAt(pos - vec2(ca, 0.0), lod);
  vec4 c = vec4(red.r, green.g, blue.b, max(green.a, max(red.a, blue.a)));
  // Deep cards fade (the prototype's light haze). The melt inputs are blended by coverage at the
  // cards' edges, as the scene's alpha is, so deep there is the stored value over the coverage.
  float cover = coverAt(pos);
  float deep = clamp(textureLod(uMeltInputs, pos, 0.0).a / max(cover, 1e-3), 0.0, 1.0);
  c *= 1.0 - DEEP_FADE * deep;
  // Scanlines darken as it melts; tape noise comes up, then grey static, then it is gone.
  c.rgb *= 1.0 - 0.18 * m * step(0.5, fract(uv.y * uRes.y / 3.0));
  float nz = hash12(uv * uRes + uTime);
  float pres = smoothstep(0.02, 0.35, e.mean);
  c.rgb += (nz - 0.5) * 0.12 * TAPE_NOISE * (m + eb * 0.5) * pres * c.a;
  float grey = smoothstep(0.55, 0.85, m) * min(TAPE_NOISE, 1.0) * pres;
  c.rgb = mix(c.rgb, vec3(nz) * 0.85 * c.a, grey);
  c *= 1.0 - smoothstep(0.85, 1.0, m);
  // A crisp outline where the shifted picture's card ends (the prototype mixes towards the
  // background by coverage there): alpha follows smoothstep(coverage), keeping the depth fade.
  c *= smoothstep(0.35, 0.65, cover) / max(cover, 0.35);
  c.a = min(c.a, 1.0);
  // Premultiplied: the noise may not push a channel past alpha.
  c.rgb = clamp(c.rgb, 0.0, c.a);
  if (uShowreelOn > 0.5) {
    vec4 r;
    if (uMelt <= 0.0) {
      // Untouched until the melt starts, so the hand-over matches the static hero.
      r = texture(uShowreel, uv);
    } else {
      // The ring grows from the centre past the corners; inside it the Showreel drops out line by
      // line over RING_DEPTH, so by the end of the melt the last line is gone.
      vec2 rq = (uv - uCentre) * vec2(uAspect, 1.0);
      float dist = length(rq);
      float radius = uMelt * (uReach + RING_REACH_MARGIN + RING_DEPTH) - RING_WIDTH;
      float rm = clamp((radius - dist) / RING_DEPTH, 0.0, 1.0);
      float o = (dist - radius) / RING_WIDTH;
      float ringJ = exp(-o * o);
      float rjj = rj * (ringJ * 0.03 + rm * 0.05) * LINE_JITTER;
      float rca = ca * 0.5 + ringJ * 0.004 * CHROMA_BLEED;
      vec4 ra = showreelAt(uv + vec2(rjj + rca, 0.0), 0.0);
      vec4 rg = showreelAt(uv + vec2(rjj, 0.0), 0.0);
      vec4 rb = showreelAt(uv + vec2(rjj - rca, 0.0), 0.0);
      r = vec4(ra.r, rg.g, rb.b, max(max(ra.a, rg.a), rb.a));
      float snow = smoothstep(0.1, 0.5, rm) * 0.7 * min(TAPE_NOISE + 0.3, 1.0);
      r.rgb = mix(r.rgb, vec3(nz) * r.a, snow);
      r *= 1.0 - smoothstep(0.0, 0.35, rm - hash12(vec2(row, 7.0)) * 0.6);
    }
    c = r + c * (1.0 - r.a);
  }
  outColor = vec4(min(c.rgb, vec3(c.a)), c.a);
}`

/** The texture units the composite reads from. */
const UNITS = { scene: 0, meltInputs: 1, showreel: 2, heat: 3 }

export function createComposite(gl: WebGL2RenderingContext): Composite {
  const program = link(gl, QUAD_VERTEX, FRAGMENT)
  const at = uniforms(gl, program, [
    'uScene',
    'uMeltInputs',
    'uShowreel',
    'uHeat',
    'uRes',
    'uShowreelOn',
    'uMelt',
    'uReach',
    'uAspect',
    'uTime',
    'uSpeed',
    'uShift',
    'uCentre',
  ])
  const quad = screenQuad(gl)
  // Both are read blurred where the picture melts, so they keep mipmaps.
  const scene = createTarget(gl, { depth: true, meltInputs: true, mipmaps: true })
  const showreel = createTarget(gl, { depth: false, mipmaps: true })
  // The drawing buffer's size in pixels: the signal's rows and shifts are counted in pixels.
  let size = { width: 1, height: 1 }

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
      size = { width: Math.max(1, width), height: Math.max(1, height) }
    },

    draw({ showreelOn, melt, centre, reach, aspect, time, speed, shift, heat }) {
      gl.disable(gl.DEPTH_TEST)
      gl.disable(gl.BLEND)
      gl.useProgram(program)
      gl.bindVertexArray(quad.array)
      bind(UNITS.scene, scene.texture)
      bind(UNITS.meltInputs, scene.meltInputs)
      bind(UNITS.showreel, showreel.texture)
      bind(UNITS.heat, heat)
      gl.uniform1i(at.uScene, UNITS.scene)
      gl.uniform1i(at.uMeltInputs, UNITS.meltInputs)
      gl.uniform1i(at.uShowreel, UNITS.showreel)
      gl.uniform1i(at.uHeat, UNITS.heat)
      gl.uniform2f(at.uRes, size.width, size.height)
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
      for (const unit of [UNITS.heat, UNITS.showreel, UNITS.meltInputs, UNITS.scene])
        bind(unit, null)
    },

    destroy() {
      scene.destroy()
      showreel.destroy()
      quad.destroy()
      gl.deleteProgram(program)
    },
  }
}
