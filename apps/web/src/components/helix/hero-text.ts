import { HERO_TEXT_SELECTOR } from '../../lib/home-marks'
import { colourTexture, HelixUnavailable } from './gl'
import { drawWhenFontLoads } from './glyph-atlas'

/**
 * How far the hero's text slides down as it leaves with the zoom (px): the `translate` in
 * `Hero.tsx`, keep the two in step.
 */
export const HERO_SLIDE_PX = 16

/** The words of `text`: each run of non-space characters, with where it starts and ends. */
export function wordsOf(text: string): { word: string; start: number; end: number }[] {
  return [...text.matchAll(/\S+/g)].map((match) => ({
    word: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }))
}

/**
 * Where a word is drawn in the hero text texture, in CSS px from the canvas's top left: its left
 * edge and its baseline, `ascent` (the font's, as the page lays it out) below the top of its box.
 * The page's text is measured where it is now, `gone` of the way through its slide down, so the
 * slide is taken back out: the composite slides the texture itself.
 */
export function wordPlacement(
  rect: { left: number; top: number },
  box: { left: number; top: number },
  ascent: number,
  gone: number,
) {
  return { x: rect.left - box.left, y: rect.top - box.top + ascent - gone * HERO_SLIDE_PX }
}

/** The canvas font shorthand an element's text is set in. */
const fontOf = (style: CSSStyleDeclaration) =>
  `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`

export type HeroText = {
  /** The hero's text as the page lays it out over the canvas (premultiplied), clear until drawn. */
  readonly texture: WebGLTexture
  /** Resolves once the hero's fonts have loaded (or failed to), so the text can be drawn. */
  readonly ready: Promise<void>
  /** Matches the texture to the drawing buffer; the text is drawn again before it next shows. */
  resize(width: number, height: number): void
  /**
   * Draws the text if it shows (`gone` below 1) and the layout may have changed since it was last
   * drawn (a resize, or the hero having left, as its layout changes then).
   */
  update(gone: number): void
  destroy(): void
}

/**
 * The hero's name, © line and Statement (`HERO_TEXT_SELECTOR`), drawn with canvas 2D into a texture
 * the composite draws over the Showreel. Each word is drawn
 * where the page lays it out, in its font, size, letter spacing and colour, after the fonts have
 * loaded; the page's text stays for screen readers, visually hidden while the Helix runs.
 */
export function createHeroText(gl: WebGL2RenderingContext): HeroText {
  const target = gl.canvas as HTMLCanvasElement
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new HelixUnavailable('No 2D context for the hero text')
  const texture = colourTexture(gl, new Uint8Array([0, 0, 0, 0]))
  const elements = () => [...document.querySelectorAll<HTMLElement>(HERO_TEXT_SELECTOR)]

  let fontsLoaded = () => {}
  const ready = new Promise<void>((resolve) => (fontsLoaded = resolve))
  const fonts = elements().map((element) => fontOf(getComputedStyle(element)))
  const cancel = drawWhenFontLoads(document.fonts, fonts, fontsLoaded)
  let dirty = true
  // Drawn again once the fonts are in, in case it was drawn before (no hand-over waited for them).
  void ready.then(() => (dirty = true))

  const draw = (gone: number) => {
    const box = target.getBoundingClientRect()
    const ratio = canvas.width / Math.max(1, box.width)
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    const range = document.createRange()
    for (const element of elements()) {
      const style = getComputedStyle(element)
      context.font = fontOf(style)
      context.fillStyle = style.color
      if ('letterSpacing' in context) context.letterSpacing = style.letterSpacing
      const ascent = context.measureText(element.textContent ?? '').fontBoundingBoxAscent
      const texts = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = texts.nextNode(); node; node = texts.nextNode()) {
        for (const { word, start, end } of wordsOf(node.textContent ?? '')) {
          range.setStart(node, start)
          range.setEnd(node, end)
          const rect = range.getClientRects()[0]
          if (!rect?.width) continue
          const { x, y } = wordPlacement(rect, box, ascent, gone)
          context.fillText(word, x, y)
        }
      }
    }
    // Premultiplied, as the composite blends it; not flipped: the canvas's top row comes first.
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  return {
    texture,
    ready,
    resize(width, height) {
      canvas.width = Math.max(1, width)
      canvas.height = Math.max(1, height)
      dirty = true
    },
    update(gone) {
      if (gone >= 1) dirty = true
      else if (dirty) {
        dirty = false
        draw(gone)
      }
    },
    destroy() {
      cancel()
      gl.deleteTexture(texture)
    },
  }
}
