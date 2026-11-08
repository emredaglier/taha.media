import {
  cardOnScreen,
  coverScale,
  cropToCard,
  HELIX_SHAPE,
  lensFor,
  turnOnScreen,
  type ScreenPoint,
} from '../../lib/helix-geometry'
import type { PointerPath } from '../../lib/helix-heat'
import type { HelixWork } from '../FeaturedWorks'
import type { HelixShowreel } from '../Hero'
import { createComposite, MELT_INPUTS_GLSL } from './composite'
import { CYLINDER_GLSL } from './cylinder'
import {
  colourTexture,
  cssColour,
  float,
  HelixUnavailable,
  link,
  MAX_PIXEL_RATIO,
  uniforms,
  vertexArray,
} from './gl'
import { nextFrame } from './frame-count'
import { createHeatTrail } from './heat'
import { createPreviewLoops } from './loops'
import { createShowreelLayer } from './showreel'

export { HelixUnavailable } from './gl'

/** What the Helix needs of a Featured Work to draw its cards: the Preview loop and its poster. */
type HelixMedia = Pick<HelixWork, 'previewLoop' | 'poster'>

/**
 * A card to draw: where it sits (`slot`), the Work on it, how present it is (cards appear during
 * the zoom), whether it shows its Work's Preview loop, playing or frozen on its last frame
 * (`showsLoop`; otherwise its poster), and how far it is hovered (`hovered`) or dimmed for not
 * being hovered (`dimmed`), each 0 to 1 as the hover eases in and out.
 */
export type HelixCard = {
  slot: number
  work: number
  presence: number
  showsLoop: boolean
  hovered: number
  dimmed: number
}

/**
 * One frame to draw: the cards in the visible band, the band's reach (cards melt towards it), how
 * far the turning speed bends them, where the Helix is (`progress`, cards), the opening (the
 * camera's pull-back, 0 the Showreel full-bleed to 1 the Helix in place, and the Showreel, where
 * it sits and how far it has melted, until it is gone), the Works whose loops play and whose
 * frames are held (`previewLoops`), the pointer's path since the last frame (it leaves heat),
 * and the seconds since the last frame.
 */
export type HelixFrame = {
  cards: readonly HelixCard[]
  band: number
  bend: number
  progress: number
  zoom: number
  showreel: { slot: number; melt: number } | null
  playing: ReadonlySet<number>
  held: ReadonlySet<number>
  cursor: PointerPath | null
  dt: number
}

export type HelixRenderer = {
  draw(frame: HelixFrame): void
  /** Matches the drawing buffer to the canvas's size on screen (device pixel ratio capped at 2). */
  resize(): void
  /**
   * Resolves once the Showreel layer shows what the static hero shows (`shown`: its loop on
   * screen, if one plays), so the Helix can take over under a matching picture.
   */
  handOver(shown: HTMLVideoElement | null): Promise<void>
  /**
   * Pauses every video while the tab is hidden: the Preview loops (their frames stay) and the
   * Showreel. The next draw plays again what should play.
   */
  pause(): void
  destroy(): void
}

/** The card mesh: enough columns to curve around the cylinder, rows to bend with the speed. */
const COLUMNS = 40
const ROWS = 8

const VERTEX = `#version 300 es
in vec2 aPos;
uniform float uSlot, uFocal, uAspect, uBend, uScale;
out vec2 vUv;
out float vDepth;
${CYLINDER_GLSL}
const float NEAR = ${float(HELIX_SHAPE.near)};
const float FAR = ${float(HELIX_SHAPE.far)};
const float BEND = ${float(HELIX_SHAPE.bend)};
void main() {
  vUv = aPos;
  float ty = (aPos.y - 0.5) * 2.0;
  float angle = uSlot * TWIST + uBend * BEND * ty * ty * TWIST * 0.5;
  vec3 p = cardPoint(aPos, uSlot, angle);
  float vz = p.z - CAMERA_Z;
  vDepth = -vz;
  // uScale: the opening's camera, pulled in until the front card covers the screen, then back.
  gl_Position = vec4(p.x * uFocal / uAspect * uScale, p.y * uFocal * uScale,
                     ((FAR + NEAR) * vz + 2.0 * FAR * NEAR) / (NEAR - FAR), -vz);
}`

// The cards as they are, and the melt inputs the analogue signal needs (see `composite`): how far a
// card is not there (it hasn't appeared yet in the opening, or it is in the last slot before the
// edge of the visible band, so a card beyond it, which may repeat a Work on screen, is never
// seen), dimmed or hovered, and how deep in the Helix (the prototype's light haze, which the
// hovered card doesn't get; the composite fades deep cards by it). Alpha is the card's coverage
// alone, so the composite can trace the cards' outline from it. The page colour shows through
// wherever a card fades (alpha), so the canvas never reads a CSS colour (playbook: canvas-colours).
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
in float vDepth;
uniform sampler2D uMap;
uniform vec4 uCrop;
uniform float uSlot, uBand, uPresence, uHovered, uDimmed;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outMeltInputs;
${MELT_INPUTS_GLSL}
void main() {
  vec2 uv = vUv;
  if (!gl_FrontFacing) uv.x = 1.0 - uv.x;   // past the side of the cylinder: never mirrored
  vec4 c = texture(uMap, uv * uCrop.xy + uCrop.zw);
  float deep = smoothstep(8.0, 20.6, vDepth) * (1.0 - uHovered);
  outColor = vec4(c.rgb * c.a, c.a);
  float gone = max(1.0 - uPresence, smoothstep(uBand - 1.0, uBand, abs(uSlot)));
  outMeltInputs = packMeltInputs(MeltInputs(gone, uDimmed, uHovered, deep));
}`

/** A grid of triangles over the unit square, one card's mesh. */
function cardMesh(): Float32Array {
  const vertices: number[] = []
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const [x0, x1] = [column / COLUMNS, (column + 1) / COLUMNS]
      const [y0, y1] = [row / ROWS, (row + 1) / ROWS]
      vertices.push(x0, y0, x1, y0, x0, y1, x0, y1, x1, y0, x1, y1)
    }
  }
  return new Float32Array(vertices)
}

/** A screen point (0 to 1, y up) from normalized device coordinates. */
const toScreen = (x: number, y: number): ScreenPoint => ({ x: x / 2 + 0.5, y: y / 2 + 0.5 })

/**
 * Draws the Helix on `canvas` with hand-written WebGL2 (no 3D library), in four passes: the 16:9
 * cards on the helix, each showing its Work's Preview loop (in the sharp band, or pointed at) or
 * its poster; the Showreel layer of the opening; the cursor's heat trail; and the composite
 * that puts them on the canvas through the analogue signal, melting the top and bottom away, far
 * cards and cards not pointed at, and the Showreel. Throws `HelixUnavailable` when WebGL2 or a
 * shader fails; `onLost` runs if the context is lost later.
 */
export function createHelixRenderer(
  canvas: HTMLCanvasElement,
  works: readonly HelixMedia[],
  showreelMedia: HelixShowreel,
  onLost: () => void,
): HelixRenderer {
  // The passes draw into their own multisampled targets; the canvas only takes the composite.
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
  })
  if (!gl || gl.isContextLost()) throw new HelixUnavailable('No WebGL2 context')

  const program = link(gl, VERTEX, FRAGMENT)
  const at = uniforms(gl, program, [
    'uSlot',
    'uFocal',
    'uAspect',
    'uBend',
    'uScale',
    'uMap',
    'uCrop',
    'uBand',
    'uPresence',
    'uHovered',
    'uDimmed',
  ])
  const mesh = vertexArray(gl, cardMesh())
  const composite = createComposite(gl)
  const heat = createHeatTrail(gl)
  const host = canvas.parentElement!
  // The plain block stands in for a Showreel with neither loop nor poster: the colour the static
  // hero has then, so the hand-over matches.
  const block = cssColour(canvas, '--color-background-raised') ?? new Uint8Array([0, 0, 0, 0])
  const showreel = createShowreelLayer(gl, showreelMedia, mesh, block, host)
  const loops = createPreviewLoops(gl, works, host)

  // One still per Work (repeated cards share it): the Preview loop's poster. Until it arrives it
  // shows the placeholder colour, or nothing if that can't be read.
  const placeholder = cssColour(canvas, '--color-placeholder') ?? new Uint8Array([0, 0, 0, 0])
  let destroyed = false
  // Counts the drawn frames for the signal's line jitter (#66); a hidden tab draws none.
  let frame = 0
  const stills = works.map(({ poster }) => {
    const texture = colourTexture(gl, placeholder)
    const still = { texture, crop: cropToCard(poster.width, poster.height, poster.focalPoint) }

    // WebGL can only read media served with CORS (production: the bucket rule, #50).
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.src = poster.src
    image
      .decode()
      .then(() => {
        if (destroyed || gl.isContextLost()) return
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
        gl.generateMipmap(gl.TEXTURE_2D)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
        still.crop = cropToCard(image.naturalWidth, image.naturalHeight, poster.focalPoint)
      })
      // Unreadable (no CORS) or missing: the still keeps its placeholder.
      .catch(() => undefined)
    return still
  })

  const lost = (event: Event) => {
    event.preventDefault()
    onLost()
  }
  canvas.addEventListener('webglcontextlost', lost)

  return {
    handOver: (shown) => showreel.handOver(shown),

    pause() {
      loops.pause()
      showreel.play(false)
    },

    resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio))
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio))
      try {
        composite.resize(canvas.width, canvas.height)
      } catch (error) {
        if (!(error instanceof HelixUnavailable)) throw error
        onLost()
      }
      heat.resize(canvas.clientWidth / Math.max(1, canvas.clientHeight))
    },

    draw({ cards, band, bend, progress, zoom, showreel: reel, playing, held, cursor, dt }) {
      if (gl.isContextLost()) return
      const { aspect, focal } = lensFor(canvas.clientWidth, canvas.clientHeight)
      // The opening's camera: from the front card covering the screen down to 1, at a constant rate.
      const scale = coverScale(focal, aspect) ** (1 - zoom)
      loops.update(playing, held)

      // --- pass 1: the cards, and the melt inputs for the signal
      composite.scene.bind()
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      gl.enable(gl.DEPTH_TEST)
      gl.disable(gl.BLEND)
      gl.useProgram(program)
      gl.bindVertexArray(mesh.array)
      gl.uniform1f(at.uFocal, focal)
      gl.uniform1f(at.uAspect, aspect)
      gl.uniform1f(at.uBend, bend)
      gl.uniform1f(at.uScale, scale)
      gl.uniform1f(at.uBand, band)
      gl.uniform1i(at.uMap, 0)
      gl.activeTexture(gl.TEXTURE0)
      for (const { slot, work, presence, showsLoop, hovered, dimmed } of cards) {
        const still = stills[work]
        if (!still || presence <= 0) continue
        // Its loop, playing or frozen, once it has a frame; otherwise its poster.
        const { texture, crop } = (showsLoop ? loops.frame(work) : null) ?? still
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.uniform4f(at.uCrop, crop.scale.x, crop.scale.y, crop.offset.x, crop.offset.y)
        gl.uniform1f(at.uSlot, slot)
        gl.uniform1f(at.uPresence, presence)
        gl.uniform1f(at.uHovered, hovered)
        gl.uniform1f(at.uDimmed, dimmed)
        gl.drawArrays(gl.TRIANGLES, 0, mesh.count)
      }
      gl.disable(gl.DEPTH_TEST)
      composite.scene.resolve()

      // --- pass 2: the Showreel layer, while the opening has it
      showreel.play(reel !== null)
      if (reel) {
        composite.showreel.bind()
        gl.viewport(0, 0, canvas.width, canvas.height)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        showreel.draw({ zoom, slot: reel.slot, scale, focal, aspect })
        composite.showreel.resolve()
      }

      // --- pass 3: the heat trail. The cursor leaves heat along its path.
      heat.step(dt, cursor, aspect)

      // --- pass 4: the composite, onto the canvas, through the analogue signal
      const box = reel ? cardOnScreen(reel.slot, focal, aspect) : null
      const centre = box ? toScreen(box.x, box.y) : { x: 0.5, y: 0.5 }
      const speed = Math.min(1, Math.abs(bend) / HELIX_SHAPE.bendMax)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      composite.draw({
        showreelOn: reel !== null,
        melt: reel?.melt ?? 0,
        centre,
        reach: box ? Math.hypot(box.halfWidth * aspect, box.halfHeight) / 2 : 0,
        aspect,
        time: (performance.now() / 1000) % 1000,
        frame: (frame = nextFrame(frame)),
        speed,
        shift: turnOnScreen(progress, focal),
        heat: heat.texture,
      })
    },

    destroy() {
      destroyed = true
      canvas.removeEventListener('webglcontextlost', lost)
      // The context itself stays: React may mount again on the same canvas.
      for (const still of stills) gl.deleteTexture(still.texture)
      loops.destroy()
      showreel.destroy()
      heat.destroy()
      composite.destroy()
      mesh.destroy()
      gl.deleteProgram(program)
    },
  }
}
