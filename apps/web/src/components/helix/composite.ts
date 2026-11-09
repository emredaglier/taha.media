import { HELIX_TUNING } from '../../lib/helix-tuning'
import { createTarget, float, link, QUAD_VERTEX, screenQuad, uniforms, type Target } from './gl'
import { createGlyphAtlas, GLYPH_ATLAS } from './glyph-atlas'

/**
 * The composite (#45 "pass 4"): the cards (`scene`) and the Showreel layer (`showreel`), each
 * drawn into its own screen-sized target, put together on the canvas through the glyph mosaic
 * (#68), the one melt material that does every job:
 * - The picture turns into a grid of letters (`. : - + T A H A`, in Taha's serif, `GlyphAtlas`),
 *   each cell's glyph picked by its brightness and tinted with its colour. As it melts, the cells
 *   grow coarser and then shrink away out of step, until the page shows through.
 * - How melted each pixel is comes from one measure (`meltAt`): the top and bottom of the screen
 *   beyond the sharp band, cards deep in the Helix, cards not hovered, and cards that haven't
 *   appeared yet (or are leaving the visible band). The hovered card doesn't melt at the edges or
 *   for depth.
 * - Seamless (#68): glyphs appear only where the picture melts, and never beyond a card's own
 *   anti-aliased edge (or the Showreel's). The cells come in a few fixed sizes, each a whole grid
 *   riding with the cards, and the melt cross-fades neighbouring sizes, so the grid never tears.
 * - The cursor's heat trail (`HeatTrail`) fades the glyphs back to the picture where it passes,
 *   without changing the cell size. Turning slides the rows of cells sideways, smoothly.
 * - The Showreel dissolves through a ring of coarse glyphs that grows from its centre.
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
 * the cards' coverage, which the glyphs are clipped to.
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
  /** How fast the Helix turns, 0 to 1: it slides the rows of cells sideways. */
  speed: number
  /** How far the Helix has turned, in screen heights (`turnOnScreen`): the grid follows it. */
  shift: number
  /** The cursor's heat trail (`HeatTrail`; red). */
  heat: WebGLTexture
}

// A hash, as the prototype has it: one steady random number per cell.
const HASH = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`

// The owner's values are in the tuning object; the rest is the prototype's glyph mosaic, made
// seamless (#68, "Seamless and smooth"): no outline band, nothing drawn outside a card, a grid that
// never tears and no flicker.
const GLYPHS = HELIX_TUNING.glyphs
const RING = HELIX_TUNING.meltRing

// Everything is premultiplied: where the picture has melted away, or nothing is drawn, the page
// colour shows through the canvas (playbook: canvas-colours), so it never reads a CSS colour. The
// prototype's fades towards the background colour are fades of colour and alpha together here,
// and a glyph is its cell's colour premultiplied by the glyph's coverage.
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene, uMeltInputs, uShowreel, uHeat, uGlyphs;
uniform vec2 uRes, uCentre;
uniform float uShowreelOn, uMelt, uReach, uAspect, uSpeed, uShift;
out vec4 outColor;
const float SHARP_BAND = ${float(HELIX_TUNING.sharpBand)};
const float FAR_CARDS = ${float(HELIX_TUNING.farCards)};
const float NOT_HOVERED = ${float(HELIX_TUNING.notHovered)};
const float LARGEST_CELL = ${float(GLYPHS.largestCell)};
const float GLYPH_LEVELS = ${float(GLYPHS.glyphLevels)};
const float STAGGER = ${float(GLYPHS.stagger)};
const float CURSOR_SHRINK = ${float(GLYPHS.cursorShrink)};
const float GLYPH_COUNT = ${float(GLYPH_ATLAS.glyphs.length)};
const float GLYPH_CELL_PX = ${float(GLYPH_ATLAS.cell)};
const float DEEP_FADE = ${float(DEEP_FADE)};
const float RING_DEPTH = ${float(RING.depth)};
const float RING_REACH_MARGIN = ${float(RING.reachMargin)};
// Cell sizes are in px at a screen this tall (the prototype's), so the look is the same at any size.
const float CELL_SCREEN_PX = 900.0;
// The cell sizes: RUNGS whole grids, from SMALLEST_CELL px up to the largest, each the last times
// the same factor. The melt cross-fades two neighbouring grids, so the cells grow from fine to
// coarse without a grid ever changing size from one pixel to the next (which tears it).
const float SMALLEST_CELL = 2.0;
const float RUNGS = 4.0;
${HASH}
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
// How deep in the Helix the card at uv is, 0 to 1. The melt inputs are blended by coverage at the
// cards' edges, as the scene's alpha is, so it is the stored value over the coverage.
float deepAt(vec2 uv) {
  vec2 at = clamp(uv, 0.001, 0.999);
  return clamp(textureLod(uMeltInputs, at, 0.0).a / max(coverAt(at), 1e-3), 0.0, 1.0);
}
vec4 sceneAt(vec2 uv, float lod) { return textureLod(uScene, clamp(uv, 0.001, 0.999), lod); }
vec4 showreelAt(vec2 uv, float lod) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return textureLod(uShowreel, uv, lod);
}
// How far the Showreel's ring has passed uv, 0 (not yet) to 1 (its cells gone). The ring grows
// from the centre past the corners, so by the end of the melt the last cell is gone.
float ringAt(vec2 uv) {
  float dist = length((uv - uCentre) * vec2(uAspect, 1.0));
  float radius = uMelt * (uReach + RING_REACH_MARGIN + RING_DEPTH) - 0.03;
  return clamp((radius - dist) / RING_DEPTH, 0.0, 1.0);
}
// One cell of the glyph grid cellPx px wide, at uv: premultiplied (glyph colour, coverage), before
// it is clipped to what covers the pixel. The grid rides with the cards (uShift), and turning
// slides each row sideways by its own amount. The cell's colour, how melted it is and its depth are
// read once, at its centre, so a cell is one glyph; its brightness picks the glyph, and as the cell
// melts, the glyph shrinks about its centre, out of step with its neighbours (STAGGER).
vec4 glyphCell(vec2 uv, float cellPx, bool reel) {
  float cell = cellPx / CELL_SCREEN_PX;
  vec2 q = (uv - vec2(0.0, uShift)) * vec2(uAspect, 1.0);
  float slide = (hash12(vec2(floor(q.y / cell), 3.7)) - 0.5) * uSpeed * 0.06;
  q.x += slide;
  vec2 id = floor(q / cell);
  vec2 cl = fract(q / cell);
  float h = hash12(id);
  vec2 cuv = vec2(((id.x + 0.5) * cell - slide) / uAspect, (id.y + 0.5) * cell + uShift);
  float lod = clamp(log2(cell * uRes.y) + 0.5, 0.0, 6.0);
  vec3 col;
  float vm;
  float fade = 1.0;
  if (reel) {
    vec4 rs = showreelAt(cuv, lod);
    col = rs.a > 0.001 ? rs.rgb / rs.a : vec3(0.0);
    vm = ringAt(cuv);
  } else {
    // A cell whose centre is off the card takes its colour, melt and depth from the card at the
    // pixel, so no cell along a card's edge reads the empty page.
    vec2 at = coverAt(cuv) > 0.5 ? cuv : uv;
    // The scene is premultiplied: its colour over its alpha is the cell's own colour.
    vec4 sc = sceneAt(at, lod);
    col = sc.a > 0.001 ? sc.rgb / sc.a : vec3(0.0);
    vm = meltAt(at);
    fade = 1.0 - DEEP_FADE * deepAt(at);
  }
  float s = 1.0 - smoothstep(0.6, 0.9, vm * (1.0 + h * STAGGER * 0.8));
  float lum = clamp(dot(col, vec3(0.3, 0.59, 0.11)) * 1.25, 0.0, 1.0);
  float lv = floor(GLYPH_LEVELS + 0.5);
  float lvl = floor(lum * lv * 0.9999);
  float ai = floor(lvl / max(lv - 1.0, 1.0) * (GLYPH_COUNT - 1.0) + 0.5);
  vec2 gc = (cl - 0.5) / max(s, 0.06) + 0.5;
  float inb = step(0.0, gc.x) * step(gc.x, 1.0) * step(0.0, gc.y) * step(gc.y, 1.0);
  float glod = clamp(log2(GLYPH_CELL_PX / max(cell * uRes.y * max(s, 0.2), 1.0)), 0.0, 4.0);
  vec2 guv = vec2((ai + clamp(gc.x, 0.0, 1.0)) / GLYPH_COUNT, 1.0 - clamp(gc.y, 0.0, 1.0));
  float a = textureLod(uGlyphs, guv, glod).r * inb * s * fade;
  return vec4(min(col * 1.3, vec3(1.0)) * a, a);
}
// The mosaic at uv, grown from the finest grid (grow 0) to the coarsest, whose cells are largest
// px wide (grow 1): the two neighbouring grids, cross-faded by how far between them it is.
vec4 mosaicAt(vec2 uv, float grow, float largest, bool reel) {
  float t = clamp(grow, 0.0, 1.0) * (RUNGS - 1.0);
  float lower = min(floor(t), RUNGS - 2.0);
  float factor = largest / SMALLEST_CELL;
  vec4 fine = glyphCell(uv, SMALLEST_CELL * pow(factor, lower / (RUNGS - 1.0)), reel);
  vec4 coarse = glyphCell(uv, SMALLEST_CELL * pow(factor, (lower + 1.0) / (RUNGS - 1.0)), reel);
  return mix(fine, coarse, t - lower);
}
void main() {
  vec2 uv = vUv;
  float heat = texture(uHeat, uv).r;
  float m = meltAt(uv);
  // The card itself, with its own anti-aliased edge: deep cards fade (the prototype's light
  // haze), and from 0.55 it fades out until it is gone.
  vec4 c = sceneAt(uv, 0.0) * (1.0 - DEEP_FADE * deepAt(uv));
  c *= 1.0 - smoothstep(0.55, 1.0, m);
  // The glyphs take over only where it melts; the cursor's heat fades them back to the picture.
  float k = smoothstep(0.03, 0.2, m * (1.0 - 0.8 * clamp(heat * CURSOR_SHRINK, 0.0, 1.0)));
  if (k > 0.0) {
    // Clipped to the card's coverage at the pixel: no glyph reaches past a card's edge.
    vec4 g = mosaicAt(uv, smoothstep(0.0, 0.6, m), LARGEST_CELL, false) * coverAt(uv);
    c = mix(c, g, k);
  }
  c.a = min(c.a, 1.0);
  // Premultiplied: a channel may not exceed alpha.
  c.rgb = clamp(c.rgb, 0.0, c.a);
  if (uShowreelOn > 0.5) {
    vec4 r;
    if (uMelt <= 0.0) {
      // Untouched until the melt starts, so the hand-over matches the static hero.
      r = texture(uShowreel, uv);
    } else {
      // Inside the ring the Showreel turns to coarse glyphs, which shrink away over RING_DEPTH.
      float rm = ringAt(uv);
      vec4 plain = showreelAt(uv, 0.0);
      r = plain * (1.0 - smoothstep(0.6, 1.0, rm));
      float kr = smoothstep(0.03, 0.2, rm);
      if (kr > 0.0) {
        // Clipped to the Showreel's own alpha at the pixel.
        vec4 g = mosaicAt(uv, smoothstep(0.0, 0.5, rm), LARGEST_CELL * 1.4, true) * plain.a;
        r = mix(r, g, kr);
      }
    }
    c = r + c * (1.0 - r.a);
  }
  outColor = vec4(min(c.rgb, vec3(c.a)), c.a);
}`

/** The texture units the composite reads from. */
const UNITS = { scene: 0, meltInputs: 1, showreel: 2, heat: 3, glyphs: 4 }

/**
 * The composite for `gl`. `host` is the element the glyph atlas reads the site's serif under (the
 * canvas); the atlas is built here, so it is rebuilt with everything else in a new context.
 */
export function createComposite(gl: WebGL2RenderingContext, host: Element): Composite {
  const program = link(gl, QUAD_VERTEX, FRAGMENT)
  const at = uniforms(gl, program, [
    'uScene',
    'uMeltInputs',
    'uShowreel',
    'uHeat',
    'uGlyphs',
    'uRes',
    'uShowreelOn',
    'uMelt',
    'uReach',
    'uAspect',
    'uSpeed',
    'uShift',
    'uCentre',
  ])
  const quad = screenQuad(gl)
  // Both are read blurred where the picture melts, so they keep mipmaps.
  const scene = createTarget(gl, { depth: true, meltInputs: true, mipmaps: true })
  const showreel = createTarget(gl, { depth: false, mipmaps: true })
  const glyphs = createGlyphAtlas(gl, host, UNITS.glyphs)
  // The drawing buffer's size in pixels: how blurred a cell's colour and its glyph are read.
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

    draw({ showreelOn, melt, centre, reach, aspect, speed, shift, heat }) {
      gl.disable(gl.DEPTH_TEST)
      gl.disable(gl.BLEND)
      gl.useProgram(program)
      gl.bindVertexArray(quad.array)
      bind(UNITS.scene, scene.texture)
      bind(UNITS.meltInputs, scene.meltInputs)
      bind(UNITS.showreel, showreel.texture)
      bind(UNITS.heat, heat)
      bind(UNITS.glyphs, glyphs.texture)
      gl.uniform1i(at.uScene, UNITS.scene)
      gl.uniform1i(at.uMeltInputs, UNITS.meltInputs)
      gl.uniform1i(at.uShowreel, UNITS.showreel)
      gl.uniform1i(at.uHeat, UNITS.heat)
      gl.uniform1i(at.uGlyphs, UNITS.glyphs)
      gl.uniform2f(at.uRes, size.width, size.height)
      gl.uniform1f(at.uShowreelOn, showreelOn ? 1 : 0)
      gl.uniform1f(at.uMelt, melt)
      gl.uniform1f(at.uReach, reach)
      gl.uniform1f(at.uAspect, aspect)
      gl.uniform1f(at.uSpeed, speed)
      gl.uniform1f(at.uShift, shift)
      gl.uniform2f(at.uCentre, centre.x, centre.y)
      gl.drawArrays(gl.TRIANGLES, 0, quad.count)
      // Unbound again, so no later pass draws into a texture it is also reading.
      for (const unit of [UNITS.glyphs, UNITS.heat, UNITS.showreel, UNITS.meltInputs, UNITS.scene])
        bind(unit, null)
    },

    destroy() {
      scene.destroy()
      showreel.destroy()
      glyphs.destroy()
      quad.destroy()
      gl.deleteProgram(program)
    },
  }
}
