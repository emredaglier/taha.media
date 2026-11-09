import { describe, expect, it, vi } from 'vitest'
import { atlasFont, drawWhenFontLoads } from './glyph-atlas'

/** A font set whose load the test settles by hand. */
function fontSet() {
  let settle: { resolve: () => void; reject: (error: Error) => void } | null = null
  const load = vi.fn(
    () =>
      new Promise<FontFace[]>((resolve, reject) => {
        settle = { resolve: () => resolve([]), reject }
      }),
  )
  return {
    fonts: { load },
    loaded: () => settle!.resolve(),
    failed: () => settle!.reject(new Error('bad font')),
  }
}

/** Lets the promise callbacks run. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('drawWhenFontLoads: the glyph atlas waits for the serif', () => {
  it('asks for the font the atlas draws with', () => {
    const { fonts } = fontSet()
    drawWhenFontLoads(fonts, atlasFont('Display'), () => undefined)
    expect(fonts.load).toHaveBeenCalledWith(atlasFont('Display'))
  })

  it('draws nothing until the font has loaded, then draws once', async () => {
    const { fonts, loaded } = fontSet()
    const draw = vi.fn()
    drawWhenFontLoads(fonts, atlasFont('Display'), draw)
    await settled()
    expect(draw).not.toHaveBeenCalled()
    loaded()
    await settled()
    expect(draw).toHaveBeenCalledTimes(1)
  })

  it('still draws when the browser refuses the font, with what the page itself shows', async () => {
    const { fonts, failed } = fontSet()
    const draw = vi.fn()
    drawWhenFontLoads(fonts, atlasFont('Display'), draw)
    failed()
    await settled()
    expect(draw).toHaveBeenCalledTimes(1)
  })

  it('draws nothing once cancelled (the Helix went away while the font loaded)', async () => {
    const { fonts, loaded } = fontSet()
    const draw = vi.fn()
    const cancel = drawWhenFontLoads(fonts, atlasFont('Display'), draw)
    cancel()
    loaded()
    await settled()
    expect(draw).not.toHaveBeenCalled()
  })
})

describe('atlasFont', () => {
  it('is a bold font shorthand in the given family, which a canvas and the font set both read', () => {
    expect(atlasFont("ui-serif, Georgia, 'Times New Roman', serif")).toBe(
      "700 50px ui-serif, Georgia, 'Times New Roman', serif",
    )
  })
})
