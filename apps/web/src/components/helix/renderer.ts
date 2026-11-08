import { cropToCard, focalFor, HELIX_SHAPE, SLOT_PITCH } from '../../lib/helix-geometry'
import { HELIX_TUNING } from '../../lib/helix-tuning'
import type { HelixWork } from '../FeaturedWorks'

/** A card's still frame: its Preview loop's poster. */
type HelixPoster = HelixWork['poster']

/**
 * One frame to draw: the cards in the visible band with their slot and Work, the band's reach
 * (cards fade out towards it), and how far the turning speed bends them.
 */
export type HelixFrame = {
  cards: readonly { slot: number; work: number }[]
  band: number
  bend: number
}

export type HelixRenderer = {
  draw(frame: HelixFrame): void
  /** Matches the drawing buffer to the canvas's size on screen (device pixel ratio capped at 2). */
  resize(): void
  /** Whether a poster arrived since the last draw, so a resting Helix still needs a frame. */
  readonly stale: boolean
  destroy(): void
}

/** WebGL2 isn't there, a shader didn't compile, or the context was lost: show the static Home. */
export class HelixUnavailable extends Error {}

const MAX_PIXEL_RATIO = 2
/** The card mesh: enough columns to curve around the cylinder, rows to bend with the speed. */
const COLUMNS = 40
const ROWS = 8

const float = (value: number) => value.toFixed(4)

const VERTEX = `#version 300 es
in vec2 aPos;
uniform float uSlot, uFocal, uAspect, uBend;
out vec2 vUv;
out float vDepth;
const vec2 CARD = vec2(${float(HELIX_SHAPE.cardHeight * HELIX_SHAPE.cardRatio)}, ${float(HELIX_SHAPE.cardHeight)});
const float RADIUS = ${float(HELIX_SHAPE.radius)};
const float RADIUS_STEP = ${float(HELIX_SHAPE.radiusStep)};
const float CAMERA_Z = ${float(HELIX_SHAPE.cameraZ)};
const float NEAR = ${float(HELIX_SHAPE.near)};
const float FAR = ${float(HELIX_SHAPE.far)};
const float TWIST = ${float(HELIX_SHAPE.twist)};
const float PITCH = ${float(SLOT_PITCH)};
const float BEND = ${float(HELIX_SHAPE.bend)};
void main() {
  vUv = aPos;
  vec2 local = (aPos - 0.5) * CARD;
  float ty = (aPos.y - 0.5) * 2.0;
  float angle = uSlot * TWIST + uBend * BEND * ty * ty * TWIST * 0.5;
  float r = RADIUS + uSlot * RADIUS_STEP;
  float theta = angle + local.x / r;
  vec3 p = vec3(sin(theta) * r, local.y - uSlot * PITCH, cos(theta) * r);
  float vz = p.z - CAMERA_Z;
  vDepth = -vz;
  gl_Position = vec4(p.x * uFocal / uAspect, p.y * uFocal,
                     ((FAR + NEAR) * vz + 2.0 * FAR * NEAR) / (NEAR - FAR), -vz);
}`

// The page colour shows through wherever a card fades (alpha), so the canvas never has to read a
// CSS colour (playbook: canvas-colours). A plain fade stands in for the melt material until #55:
// the top and bottom of the screen, and the last slot before the edge of the visible band (so a
// card beyond it, which may repeat a Work on screen, is never seen). Far cards get the prototype's
// light haze.
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
in float vDepth;
uniform sampler2D uMap;
uniform vec4 uCrop;
uniform vec2 uResolution;
uniform float uSlot, uBand, uSharpBand;
out vec4 outColor;
void main() {
  vec2 uv = vUv;
  if (!gl_FrontFacing) uv.x = 1.0 - uv.x;   // past the side of the cylinder: never mirrored
  vec4 c = texture(uMap, uv * uCrop.xy + uCrop.zw);
  float haze = smoothstep(8.0, 20.6, vDepth) * 0.35;
  float edge = pow(smoothstep(uSharpBand, 1.0, abs(gl_FragCoord.y / uResolution.y - 0.5) * 2.0), 1.65);
  float band = smoothstep(uBand - 1.0, uBand, abs(uSlot));
  float alpha = c.a * (1.0 - haze) * (1.0 - smoothstep(0.55, 1.0, edge)) * (1.0 - band);
  if (alpha < 0.004) discard;
  outColor = vec4(c.rgb * alpha, alpha);
}`

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new HelixUnavailable('No shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    throw new HelixUnavailable(`Shader: ${gl.getShaderInfoLog(shader) ?? ''}`)
  }
  return shader
}

function link(gl: WebGL2RenderingContext): WebGLProgram {
  const program = gl.createProgram()
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.bindAttribLocation(program, 0, 'aPos')
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new HelixUnavailable(`Program: ${gl.getProgramInfoLog(program) ?? ''}`)
  }
  return program
}

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
 * The colour of a CSS custom property as RGBA bytes, resolved by the browser itself (a 2D canvas
 * converts any colour syntax), or null when it can't: never a silent black.
 */
function cssColour(element: Element, property: string): Uint8Array | null {
  const value = getComputedStyle(element).getPropertyValue(property).trim()
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!value || !context) return null
  const sentinel = 'rgba(1, 2, 3, 0.5)'
  context.fillStyle = sentinel
  const before = context.fillStyle
  context.fillStyle = value
  if (context.fillStyle === before) return null
  context.fillRect(0, 0, 1, 1)
  return new Uint8Array(context.getImageData(0, 0, 1, 1).data)
}

/**
 * Draws the Helix on `canvas` with hand-written WebGL2 (no 3D library): 16:9 cards on the helix,
 * each showing its Work's poster, the top and bottom fading into the page. Throws
 * `HelixUnavailable` when WebGL2 or a shader fails; `onLost` runs if the context is lost later.
 */
export function createHelixRenderer(
  canvas: HTMLCanvasElement,
  posters: readonly HelixPoster[],
  onLost: () => void,
): HelixRenderer {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true })
  if (!gl || gl.isContextLost()) throw new HelixUnavailable('No WebGL2 context')

  const program = link(gl)
  const uniform = (name: string) => gl.getUniformLocation(program, name)
  const at = {
    slot: uniform('uSlot'),
    focal: uniform('uFocal'),
    aspect: uniform('uAspect'),
    bend: uniform('uBend'),
    map: uniform('uMap'),
    crop: uniform('uCrop'),
    resolution: uniform('uResolution'),
    band: uniform('uBand'),
    sharpBand: uniform('uSharpBand'),
  }

  const mesh = cardMesh()
  const vertexArray = gl.createVertexArray()
  const buffer = gl.createBuffer()
  gl.bindVertexArray(vertexArray)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  const vertexCount = mesh.length / 2

  // One still per Work (repeated cards share it). Until its poster arrives it shows the
  // placeholder colour, or nothing if that can't be read.
  const placeholder = cssColour(canvas, '--color-placeholder') ?? new Uint8Array([0, 0, 0, 0])
  let stale = true
  let destroyed = false
  const stills = posters.map((poster) => {
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, placeholder)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
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

    resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio))
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio))
      stale = true
    },

    draw({ cards, band, bend }) {
      if (gl.isContextLost()) return
      stale = false
      const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      gl.enable(gl.DEPTH_TEST)
      gl.useProgram(program)
      gl.bindVertexArray(vertexArray)
      gl.uniform1f(at.focal, focalFor(aspect))
      gl.uniform1f(at.aspect, aspect)
      gl.uniform1f(at.bend, bend)
      gl.uniform2f(at.resolution, canvas.width, canvas.height)
      gl.uniform1f(at.band, band)
      gl.uniform1f(at.sharpBand, HELIX_TUNING.sharpBand)
      gl.uniform1i(at.map, 0)
      gl.activeTexture(gl.TEXTURE0)
      for (const { slot, work } of cards) {
        const still = stills[work]
        if (!still) continue
        const { scale, offset } = still.crop
        gl.bindTexture(gl.TEXTURE_2D, still.texture)
        gl.uniform4f(at.crop, scale.x, scale.y, offset.x, offset.y)
        gl.uniform1f(at.slot, slot)
        gl.drawArrays(gl.TRIANGLES, 0, vertexCount)
      }
    },

    destroy() {
      destroyed = true
      canvas.removeEventListener('webglcontextlost', lost)
      // The context itself stays: React may mount again on the same canvas.
      for (const still of stills) gl.deleteTexture(still.texture)
      gl.deleteBuffer(buffer)
      gl.deleteVertexArray(vertexArray)
      gl.deleteProgram(program)
    },
  }
}
