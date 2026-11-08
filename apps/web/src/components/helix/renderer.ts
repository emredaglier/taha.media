import {
  cardOnScreen,
  coverScale,
  cropToCard,
  focalFor,
  HELIX_SHAPE,
} from '../../lib/helix-geometry'
import { HELIX_TUNING } from '../../lib/helix-tuning'
import type { HelixWork } from '../FeaturedWorks'
import type { HelixShowreel } from '../Hero'
import { createComposite } from './composite'
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
import { createShowreelLayer } from './showreel'

export { HelixUnavailable } from './gl'

/** A card's still frame: its Preview loop's poster. */
type HelixPoster = HelixWork['poster']

/**
 * One frame to draw: the cards in the visible band with their slot, Work and presence (they appear
 * during the zoom), the band's reach (cards fade out towards it), how far the turning speed bends
 * them, and the opening: the camera's pull-back (0 the Showreel full-bleed, 1 the Helix in place)
 * and the Showreel, where it sits and how far it has melted, until it is gone.
 */
export type HelixFrame = {
  cards: readonly { slot: number; work: number; presence: number }[]
  band: number
  bend: number
  zoom: number
  showreel: { slot: number; melt: number } | null
}

export type HelixRenderer = {
  draw(frame: HelixFrame): void
  /** Matches the drawing buffer to the canvas's size on screen (device pixel ratio capped at 2). */
  resize(): void
  /** Whether a poster arrived since the last draw, so a resting Helix still needs a frame. */
  readonly stale: boolean
  /**
   * Resolves once the Showreel layer shows what the static hero shows (`shown`: its loop on
   * screen, if one plays), so the Helix can take over under a matching picture.
   */
  handOver(shown: HTMLVideoElement | null): Promise<void>
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

// The page colour shows through wherever a card fades (alpha), so the canvas never has to read a
// CSS colour (playbook: canvas-colours). A plain fade stands in for the melt material until #55:
// the top and bottom of the screen, the last slot before the edge of the visible band (so a card
// beyond it, which may repeat a Work on screen, is never seen), and a card that hasn't appeared
// yet in the opening (uPresence). Far cards get the prototype's light haze.
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
in float vDepth;
uniform sampler2D uMap;
uniform vec4 uCrop;
uniform vec2 uResolution;
uniform float uSlot, uBand, uSharpBand, uPresence;
out vec4 outColor;
void main() {
  vec2 uv = vUv;
  if (!gl_FrontFacing) uv.x = 1.0 - uv.x;   // past the side of the cylinder: never mirrored
  vec4 c = texture(uMap, uv * uCrop.xy + uCrop.zw);
  float haze = smoothstep(8.0, 20.6, vDepth) * 0.35;
  float edge = pow(smoothstep(uSharpBand, 1.0, abs(gl_FragCoord.y / uResolution.y - 0.5) * 2.0), 1.65);
  float band = smoothstep(uBand - 1.0, uBand, abs(uSlot));
  float alpha = c.a * (1.0 - haze) * (1.0 - smoothstep(0.55, 1.0, edge)) * (1.0 - band) * uPresence;
  if (alpha < 0.004) discard;
  outColor = vec4(c.rgb * alpha, alpha);
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

/**
 * Draws the Helix on `canvas` with hand-written WebGL2 (no 3D library), in three passes: the 16:9
 * cards on the helix, each showing its Work's poster, the top and bottom fading into the page; the
 * Showreel layer of the opening; and the composite that puts them on the canvas and melts the
 * Showreel away. Throws `HelixUnavailable` when WebGL2 or a shader fails; `onLost` runs if the
 * context is lost later.
 */
export function createHelixRenderer(
  canvas: HTMLCanvasElement,
  posters: readonly HelixPoster[],
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
    'uResolution',
    'uBand',
    'uSharpBand',
    'uPresence',
  ])
  const mesh = vertexArray(gl, cardMesh())
  const composite = createComposite(gl)
  // The plain block stands in for a Showreel with neither loop nor poster: the colour the static
  // hero has then, so the hand-over matches.
  const block = cssColour(canvas, '--color-background-raised') ?? new Uint8Array([0, 0, 0, 0])
  const showreel = createShowreelLayer(gl, showreelMedia, mesh, block, canvas.parentElement!)

  // One still per Work (repeated cards share it). Until its poster arrives it shows the
  // placeholder colour, or nothing if that can't be read.
  const placeholder = cssColour(canvas, '--color-placeholder') ?? new Uint8Array([0, 0, 0, 0])
  let stale = true
  let destroyed = false
  const stills = posters.map((poster) => {
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
        stale = true
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
    get stale() {
      return stale
    },

    handOver: (shown) => showreel.handOver(shown),

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
      stale = true
    },

    draw({ cards, band, bend, zoom, showreel: reel }) {
      if (gl.isContextLost()) return
      stale = false
      const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight)
      const focal = focalFor(aspect)
      // The opening's camera: from the front card covering the screen down to 1, at a constant rate.
      const scale = coverScale(focal, aspect) ** (1 - zoom)

      // --- pass 1: the cards
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
      gl.uniform2f(at.uResolution, canvas.width, canvas.height)
      gl.uniform1f(at.uBand, band)
      gl.uniform1f(at.uSharpBand, HELIX_TUNING.sharpBand)
      gl.uniform1i(at.uMap, 0)
      gl.activeTexture(gl.TEXTURE0)
      for (const { slot, work, presence } of cards) {
        const still = stills[work]
        if (!still || presence <= 0) continue
        const { scale: crop, offset } = still.crop
        gl.bindTexture(gl.TEXTURE_2D, still.texture)
        gl.uniform4f(at.uCrop, crop.x, crop.y, offset.x, offset.y)
        gl.uniform1f(at.uSlot, slot)
        gl.uniform1f(at.uPresence, presence)
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

      // --- pass 3: the composite, onto the canvas. The Showreel melts from the centre of its card.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      const box = reel ? cardOnScreen(reel.slot, focal, aspect) : null
      composite.draw({
        showreelOn: reel !== null,
        melt: reel?.melt ?? 0,
        centre: box ? { x: box.x / 2 + 0.5, y: box.y / 2 + 0.5 } : { x: 0.5, y: 0.5 },
        reach: box ? Math.hypot(box.halfWidth * aspect, box.halfHeight) / 2 : 0,
        aspect,
        time: (performance.now() / 1000) % 1000,
      })
    },

    destroy() {
      destroyed = true
      canvas.removeEventListener('webglcontextlost', lost)
      // The context itself stays: React may mount again on the same canvas.
      for (const still of stills) gl.deleteTexture(still.texture)
      showreel.destroy()
      composite.destroy()
      mesh.destroy()
      gl.deleteProgram(program)
    },
  }
}
