import { colourTexture } from './gl'

/**
 * The glyph mosaic's letters (#68), as the prototype's atlas has them: a row of cells, light to
 * heavy, so a cell's brightness picks one by its place in the row. Each glyph is drawn white on
 * black, centred in a square cell `cell` px wide, its baseline `baseline` px from the cell's top.
 */
export const GLYPH_ATLAS = {
  glyphs: ['.', ':', '-', '+', 'T', 'A', 'H', 'A'],
  cell: 64,
  baseline: 35,
} as const

/** The canvas font the atlas draws with, in the site's serif `family` (the prototype's size). */
export const atlasFont = (family: string) => `700 50px ${family}`

/**
 * Calls `draw` once `font` has loaded, so the atlas never settles on a fallback serif. If the
 * browser refuses the font, it draws with what the page itself shows. The returned function
 * cancels a draw that hasn't happened yet (the Helix went away while the font loaded).
 */
export function drawWhenFontLoads(
  fonts: Pick<FontFaceSet, 'load'>,
  font: string,
  draw: () => void,
): () => void {
  let cancelled = false
  void fonts
    .load(font)
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
  destroy(): void
}

/**
 * The glyph atlas for the composite, in the serif the site's headings use (Tailwind's
 * `font-serif`). Only the font family is read from CSS, never a colour (playbook: canvas-colours):
 * the glyphs are white on black, and the composite tints them with the picture. Until the serif has
 * loaded, the atlas is black, so the mosaic draws no glyphs rather than wrong ones. `unit` is the
 * texture unit the composite reads it from; the upload leaves nothing bound there.
 */
export function createGlyphAtlas(
  gl: WebGL2RenderingContext,
  host: Element,
  unit: number,
): GlyphAtlas {
  const texture = colourTexture(gl, new Uint8Array([0, 0, 0, 255]))
  let destroyed = false

  const draw = () => {
    if (destroyed || gl.isContextLost()) return
    const { glyphs, cell, baseline } = GLYPH_ATLAS
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
    glyphs.forEach((glyph, index) => context.fillText(glyph, (index + 0.5) * cell, baseline))
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    // Not flipped: the canvas's top row is the texture's first, as the composite reads it.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  const font = atlasFont(serifFamily(host))
  const cancel = drawWhenFontLoads(document.fonts, font, draw)

  return {
    texture,
    destroy() {
      destroyed = true
      cancel()
      gl.deleteTexture(texture)
    },
  }
}

/** The font family `font-serif` resolves to, read from a probe under `host`. */
function serifFamily(host: Element): string {
  const probe = document.createElement('span')
  probe.className = 'font-serif'
  probe.hidden = true
  host.append(probe)
  const family = getComputedStyle(probe).fontFamily
  probe.remove()
  return family
}
