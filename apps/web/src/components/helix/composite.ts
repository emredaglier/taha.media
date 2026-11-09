import { CELL_SCREEN_PX, cellLadder, RING_COARSER, ringRadius } from '../../lib/helix-glyphs'
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
 * - How melted each pixel is comes from one measure (`meltOf`): the top and bottom of the screen
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
// The grids the melt cross-fades between, in px at a CELL_SCREEN_PX tall screen: the cards' and
// the Showreel's (coarser, as the prototype has it).
const CARD_CELLS = cellLadder(GLYPHS.smallestCell, GLYPHS.largestCell, GLYPHS.cellSizes)
const RING_CELLS = cellLadder(
  GLYPHS.smallestCell,
  GLYPHS.largestCell * RING_COARSER,
  GLYPHS.cellSizes,
)
/** Numbers as a GLSL float array. */
const floats = (values: readonly number[]) =>
  `float[${values.length}](${values.map(float).join(', ')})`

// Everything is premultiplied: where the picture has melted away, or nothing is drawn, the page
// colour shows through the canvas (playbook: canvas-colours), so it never reads a CSS colour. The
// prototype's fades towards the background colour are fades of colour and alpha together here,
// and a glyph is its cell's colour premultiplied by the glyph's coverage.
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene, uMeltInputs, uShowreel, uHeat, uGlyphs;
uniform vec2 uRes, uCentre;
uniform float uShowreelOn, uMelt, uRingRadius, uAspect, uSpeed, uShift;
out vec4 outColor;
const float SHARP_BAND = ${float(HELIX_TUNING.sharpBand)};
const float FAR_CARDS = ${float(HELIX_TUNING.farCards)};
const float NOT_HOVERED = ${float(HELIX_TUNING.notHovered)};
const float GLYPH_LEVELS = ${float(GLYPHS.glyphLevels)};
const float STAGGER = ${float(GLYPHS.stagger)};
const float CURSOR_SHRINK = ${float(GLYPHS.cursorShrink)};
const float GLYPH_COUNT = ${float(GLYPH_ATLAS.glyphs.length)};
const float GLYPH_CELL_PX = ${float(GLYPH_ATLAS.cell)};
const float DEEP_FADE = ${float(DEEP_FADE)};
const float RING_DEPTH = ${float(RING.depth)};
const float CELL_SCREEN_PX = ${float(CELL_SCREEN_PX)};
const int CELL_SIZES = ${CARD_CELLS.length};
const float CARD_CELLS[${CARD_CELLS.length}] = ${floats(CARD_CELLS)};
const float RING_CELLS[${RING_CELLS.length}] = ${floats(RING_CELLS)};
${HASH}
${MELT_INPUTS_GLSL}
// How much of a card covers uv, 0 to 1: the scene's alpha, which the card pass writes unfaded
// (the picture's own alpha times the coverage; the pictures are opaque).
float coverAt(vec2 uv) { return textureLod(uScene, clamp(uv, 0.001, 0.999), 0.0).a; }
// The melt inputs of the card at uv. The card pass resolves its edges from several samples, which
// blends the inputs by coverage as it blends the scene's alpha, so the stored values over the
// coverage are the card's own (or the cards' mix, where two meet).
MeltInputs inputsAt(vec2 uv) {
  vec2 at = clamp(uv, 0.001, 0.999);
  vec4 v = textureLod(uMeltInputs, at, 0.0) / max(coverAt(at), 1e-3);
  return unpackMeltInputs(clamp(v, 0.0, 1.0));
}
// How melted the picture is at uv, from its melt inputs m: 0 sharp, 1 gone.
float meltOf(MeltInputs m, vec2 uv) {
  // The hovered card keeps its edges and its depth, and isn't dimmed. Where its anti-aliased edge
  // overlaps another card the inputs are half and half; it wins there, so its edge stays clean.
  float keep = 1.0 - clamp(2.0 * m.hovered, 0.0, 1.0);
  float edge = pow(smoothstep(SHARP_BAND, 1.0, abs(uv.y - 0.5) * 2.0), 1.65);
  float v = max(edge * keep, m.deep * FAR_CARDS * keep);
  v = max(v, m.dimmed * NOT_HOVERED * keep);
  v = max(v, m.gone);
  return clamp(v, 0.0, 1.0);
}
vec4 sceneAt(vec2 uv, float lod) { return textureLod(uScene, clamp(uv, 0.001, 0.999), lod); }
vec4 showreelAt(vec2 uv, float lod) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return textureLod(uShowreel, uv, lod);
}
// How far the Showreel's ring (its radius from ringRadius) has passed uv: 0 not yet, 1 its cells
// gone.
float ringAt(vec2 uv) {
  float dist = length((uv - uCentre) * vec2(uAspect, 1.0));
  return clamp((uRingRadius - dist) / RING_DEPTH, 0.0, 1.0);
}
// How much of the layer a cell shows covers uv: a card, or the Showreel (past the screen's edge,
// the Showreel at the edge, as it is full-bleed there).
float presenceAt(vec2 uv, bool reel) {
  return reel ? showreelAt(clamp(uv, 0.0, 1.0), 0.0).a : coverAt(uv);
}
// The points a cell looks at, in quarter cells from its centre: the centre, then the four around.
const vec2 CELL_POINTS[5] = vec2[5](vec2(0.0, 0.0), vec2(-1.0, -1.0), vec2(1.0, -1.0),
                                    vec2(-1.0, 1.0), vec2(1.0, 1.0));
// Where a cell centred at cuv reads what it shows (at): the first of its points (q is a quarter
// cell) that the layer covers. Every pixel of the cell gets the same point, so the cell stays one
// glyph. False, and no glyph, when none is covered (a sliver of a card shows nothing rather than
// a speck), and for cards when any covered point is on a card hovered differently from the one
// under the pixel (hovered): a cell that touches the hovered card draws no glyph on the cards
// around it, so the hovered card's edge stays clean.
bool cellPoint(vec2 cuv, vec2 q, bool reel, float hovered, out vec2 at) {
  at = cuv;
  bool found = false;
  for (int i = 0; i < 5; i++) {
    vec2 p = cuv + q * CELL_POINTS[i];
    if (presenceAt(p, reel) <= 0.5) continue;
    if (reel) {
      at = p;
      return true;
    }
    if (abs(inputsAt(p).hovered - hovered) >= 0.5) return false;
    if (!found) {
      at = p;
      found = true;
    }
  }
  return found;
}
// One cell of the glyph grid cellPx px wide, at uv: premultiplied (glyph colour, coverage), before
// it is clipped to what covers the pixel. The grid rides with the cards (uShift), and turning
// slides each row sideways by its own amount. The cell's colour, how melted it is and its depth are
// the same for all its pixels, so a cell is one glyph: its brightness picks the glyph, and as the
// cell melts, the glyph shrinks about its centre, out of step with its neighbours (STAGGER).
// hovered is how hovered the card under the pixel is (cards only).
vec4 glyphCell(vec2 uv, float cellPx, bool reel, float hovered) {
  float cell = cellPx / CELL_SCREEN_PX;
  vec2 q = (uv - vec2(0.0, uShift)) * vec2(uAspect, 1.0);
  float slide = (hash12(vec2(floor(q.y / cell), 3.7)) - 0.5) * uSpeed * 0.06;
  q.x += slide;
  vec2 id = floor(q / cell);
  vec2 cl = fract(q / cell);
  float h = hash12(id);
  vec2 cuv = vec2(((id.x + 0.5) * cell - slide) / uAspect, (id.y + 0.5) * cell + uShift);
  // The colour is the picture blurred over about the cell, read at the cell's point:
  // unpremultiplied, it is the card's (or the Showreel's) own colour.
  float lod = clamp(log2(cell * uRes.y) + 0.5, 0.0, 6.0);
  vec2 at;
  if (!cellPoint(cuv, vec2(cell / uAspect, cell) * 0.25, reel, hovered, at)) return vec4(0.0);
  vec4 sc;
  float vm;
  float fade = 1.0;
  if (reel) {
    // Past the screen's edge the cell reads the Showreel at the edge; with next to none of it
    // there (zoomed out, off its outline), at the cell's point on it.
    sc = showreelAt(clamp(cuv, 0.0, 1.0), lod);
    if (sc.a <= 0.05) sc = showreelAt(clamp(at, 0.0, 1.0), lod);
    vm = ringAt(cuv);
  } else {
    sc = sceneAt(at, lod);
    MeltInputs mi = inputsAt(at);
    vm = meltOf(mi, at);
    fade = 1.0 - DEEP_FADE * mi.deep;
  }
  vec3 col = sc.a > 0.001 ? sc.rgb / sc.a : vec3(0.0);
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
// The mosaic at uv, grown from the finest grid (grow 0) to the coarsest (grow 1): the two
// neighbouring grids of the ladder, cross-faded by how far between them it is.
vec4 mosaicAt(vec2 uv, float grow, bool reel, float hovered) {
  float t = clamp(grow, 0.0, 1.0) * float(CELL_SIZES - 1);
  int lower = min(int(t), CELL_SIZES - 2);
  float fine = reel ? RING_CELLS[lower] : CARD_CELLS[lower];
  float coarse = reel ? RING_CELLS[lower + 1] : CARD_CELLS[lower + 1];
  vec4 a = glyphCell(uv, fine, reel, hovered);
  return mix(a, glyphCell(uv, coarse, reel, hovered), t - float(lower));
}
void main() {
  vec2 uv = vUv;
  float heat = texture(uHeat, uv).r;
  MeltInputs mi = inputsAt(uv);
  float m = meltOf(mi, uv);
  // The card itself, with its own anti-aliased edge: deep cards fade (the prototype's light
  // haze), and from 0.55 it fades out until it is gone.
  vec4 c = sceneAt(uv, 0.0) * (1.0 - DEEP_FADE * mi.deep);
  c *= 1.0 - smoothstep(0.55, 1.0, m);
  // The glyphs take over only where it melts; the cursor's heat fades them back to the picture.
  float k = smoothstep(0.03, 0.2, m * (1.0 - 0.8 * clamp(heat * CURSOR_SHRINK, 0.0, 1.0)));
  if (k > 0.0) {
    // Clipped to the card's coverage at the pixel: no glyph reaches past a card's edge.
    vec4 g = mosaicAt(uv, smoothstep(0.0, 0.6, m), false, mi.hovered) * coverAt(uv);
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
        vec4 g = mosaicAt(uv, smoothstep(0.0, 0.5, rm), true, 0.0) * plain.a;
        r = mix(r, g, kr);
      }
    }
    c = r + c * (1.0 - r.a);
  }
  outColor = vec4(min(c.rgb, vec3(c.a)), c.a);
}`

/** The texture units the composite reads from. */
const UNITS = { scene: 0, meltInputs: 1, showreel: 2, heat: 3, glyphs: 4 }

/** The composite for `gl`, with its own glyph atlas, so a new context builds a new one. */
export function createComposite(gl: WebGL2RenderingContext): Composite {
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
    'uRingRadius',
    'uAspect',
    'uSpeed',
    'uShift',
    'uCentre',
  ])
  const quad = screenQuad(gl)
  // Both are read blurred where the picture melts, so they keep mipmaps.
  const scene = createTarget(gl, { depth: true, meltInputs: true, mipmaps: true })
  const showreel = createTarget(gl, { depth: false, mipmaps: true })
  const glyphs = createGlyphAtlas(gl)
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
      gl.uniform1f(at.uRingRadius, ringRadius(melt, reach))
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
