import { colourTexture } from './gl'

/**
 * The glyph mosaic's letters (#68), as the prototype's atlas has them: a row of cells, light to
 * heavy, so a cell's brightness picks one by its place in the row. Each glyph is drawn white on
 * black, centred across a square cell `cell` px wide, its middle `middleY` px below the cell's top
 * (the prototype's, a little low, so the letters sit in the middle to the eye).
 */
export const GLYPH_ATLAS = {
  glyphs: ['.', ':', '-', '+', 'T', 'A', 'H', 'A'],
  cell: 64,
  middleY: 35,
} as const

/** The canvas font the atlas draws with, in the site's serif `family` (the prototype's size). */
export const atlasFont = (family: string) => `700 50px ${family}`

/**
 * Calls `draw` once `font` (or every one of several) has loaded, so the atlas never settles on a
 * fallback serif. If the browser refuses a font, it draws with what the page itself shows. The
 * returned function cancels a draw that hasn't happened yet (the Helix went away while the font
 * loaded).
 */
export function drawWhenFontLoads(
  fonts: Pick<FontFaceSet, 'load'>,
  font: string | readonly string[],
  draw: () => void,
): () => void {
  let cancelled = false
  void Promise.all([font].flat().map((each) => fonts.load(each)))
    .catch(() => undefined)
    .then(() => {
      if (!cancelled) draw()
    })
  return () => {
    cancelled = true
  }
}

export type GlyphAtlas = {
  /** The glyphs (red), mipmapped; all black until the serif has loaded. */
  readonly texture: WebGLTexture
  /** Resolves once the glyphs are drawn (or can't be). */
  readonly ready: Promise<void>
  destroy(): void
}

/**
 * The glyph atlas for the composite, in the serif the site's headings use (Tailwind's
 * `font-serif`). Only the font family is read from CSS, never a colour (playbook: canvas-colours):
 * the glyphs are white on black, and the composite tints them with the picture. Until the serif has
 * loaded, the atlas is black, so the mosaic draws no glyphs rather than wrong ones.
 */
export function createGlyphAtlas(gl: WebGL2RenderingContext): GlyphAtlas {
  const texture = colourTexture(gl, new Uint8Array([0, 0, 0, 255]))
  let destroyed = false
  let drawn = () => {}
  const ready = new Promise<void>((resolve) => (drawn = resolve))

  const draw = () => {
    drawn()
    if (destroyed || gl.isContextLost()) return
    const { glyphs, cell, middleY } = GLYPH_ATLAS
    const canvas = document.createElement('canvas')
    canvas.width = glyphs.length * cell
    canvas.height = cell
    const context = canvas.getContext('2d')
    if (!context) return
    context.fillStyle = '#000'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#fff'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = font
    glyphs.forEach((glyph, index) => context.fillText(glyph, (index + 0.5) * cell, middleY))
    // On unit 0, as the other uploads; unbound after, so the composite binds it where it reads it.
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    // Not flipped: the canvas's top row is the texture's first, as the composite reads it.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  const font = atlasFont(serifFamily())
  const cancel = drawWhenFontLoads(document.fonts, font, draw)

  return {
    texture,
    ready,
    destroy() {
      destroyed = true
      cancel()
      gl.deleteTexture(texture)
    },
  }
}

/**
 * The font family `font-serif` resolves to, read from a hidden probe on the body (the class, not
 * Tailwind's `--font-serif`, which it may leave out when unused), or the browser's serif.
 */
function serifFamily(): string {
  const probe = document.createElement('span')
  probe.className = 'font-serif'
  probe.hidden = true
  document.body.append(probe)
  const family = getComputedStyle(probe).fontFamily.trim()
  probe.remove()
  return family || 'serif'
}
