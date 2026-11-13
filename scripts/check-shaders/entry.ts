// The browser side of `pnpm check:shaders` (run.ts bundles and loads it): drives the real Helix
// renderer on a canvas with generated posters, and reports what it saw (pixels.ts judges it).
// A program that doesn't compile or link throws from `createHelixRenderer`; the report carries
// that error, with the GL info log in its message.
import {
  createHelixRenderer,
  type HelixCard,
  type HelixFrame,
} from '../../apps/web/src/components/helix/renderer'
import { pixelStats, type Observation, type PixelStats, type Report } from './pixels.ts'

declare global {
  interface Window {
    /** Set once the run is over, for the driver. */
    __shaderCheck?: Report
  }
}

type Works = Parameters<typeof createHelixRenderer>[1]

/** A 16:9 poster as a data URL (nothing is fetched): a gradient with a white stripe. */
function posterUrl(hue: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 180
  const context = canvas.getContext('2d')!
  const gradient = context.createLinearGradient(0, 0, 320, 180)
  gradient.addColorStop(0, `hsl(${hue},70%,55%)`)
  gradient.addColorStop(1, `hsl(${hue + 60},70%,30%)`)
  context.fillStyle = gradient
  context.fillRect(0, 0, 320, 180)
  context.fillStyle = '#fff'
  context.fillRect(150, 0, 20, 180)
  return canvas.toDataURL('image/png')
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function run(): Promise<Report> {
  const canvas = document.getElementById('helix') as HTMLCanvasElement
  const works: Works = Array.from({ length: 6 }, (_, index) => ({
    previewLoop: { src: 'missing.mp4', width: 1280, height: 720 },
    poster: {
      src: posterUrl(index * 50),
      width: 320,
      height: 180,
      focalPoint: { x: 0.5, y: 0.5 },
    },
  }))

  // A program that fails to compile or link makes this throw, with the GL info log.
  const renderer = createHelixRenderer(canvas, works, { video: null, poster: null }, () => {
    throw new Error('The WebGL context was lost')
  })
  // The renderer asked for this context, so this is it (a second call returns the same one).
  const gl = canvas.getContext('webgl2')
  if (!gl) throw new Error('The canvas has no WebGL2 context')

  renderer.resize()
  await wait(300) // the posters decode and the glyph atlas draws

  const cards: HelixCard[] = Array.from({ length: 10 }, (_, index) => ({
    slot: index - 4,
    work: index % 6,
    presence: 1,
    showsLoop: false,
    hovered: index === 4 ? 1 : 0,
    dimmed: index === 4 ? 0 : 0.5,
  }))
  const frame = (changes: Partial<HelixFrame>): HelixFrame => ({
    cards,
    band: 5,
    bend: 0.2,
    progress: 0,
    zoom: 1,
    heroGone: 1,
    crt: 0.1,
    showreel: null,
    playing: new Set(),
    held: new Set(),
    cursor: null,
    dt: 1 / 60,
    ...changes,
  })
  /** The canvas as it was just drawn. Read in the same task as the draw, before it is presented. */
  const read = (): { stats: PixelStats; shot: string } => {
    const rgba = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      rgba,
    )
    return { stats: pixelStats(rgba), shot: canvas.toDataURL('image/png') }
  }

  // The cursor sweeping across while the Helix turns and bends, then the Showreel melting.
  for (let step = 0; step < 40; step++) {
    const x = 0.2 + step * 0.015
    renderer.draw(
      frame({
        cursor: { from: { x, y: 0.5 }, to: { x: x + 0.015, y: 0.52 }, speed: 1800 },
        bend: step % 2 ? 0.6 : 0,
      }),
    )
  }
  for (let step = 0; step <= 20; step++)
    renderer.draw(
      frame({ zoom: 0.9 + step * 0.005, showreel: { slot: 0, melt: step / 20 }, heroGone: 0 }),
    )
  const framesError = gl.getError()

  renderer.draw(frame({}))
  const withCards = read()

  // The Helix at rest, then a card hovered above the sharp band with the others dimmed, then alone:
  // the heat the sweep left has died away before the empty scene is judged.
  for (let step = 0; step < 360; step++) renderer.draw(frame({ bend: 0 }))
  const hovered = cards.map((card) => ({
    ...card,
    hovered: card.slot === 1 ? 1 : 0,
    dimmed: card.slot === 1 ? 0 : 1,
  }))
  for (let step = 0; step < 90; step++) renderer.draw(frame({ cards: hovered, bend: 0 }))
  const alone = hovered.filter((card) => card.slot === 1)
  for (let step = 0; step < 90; step++) renderer.draw(frame({ cards: alone, bend: 0 }))

  // Nothing to draw and the cursor still moving (its heat must not leave noise or grey behind).
  const cursor = { from: { x: 0.3, y: 0.5 }, to: { x: 0.5, y: 0.5 }, speed: 1800 }
  for (let step = 0; step < 20; step++) renderer.draw(frame({ cards: [], showreel: null, cursor }))
  const empty = read()
  const emptyError = gl.getError()

  renderer.destroy()
  const observation: Observation = {
    glErrors: { frames: framesError, empty: emptyError },
    cards: withCards.stats,
    empty: empty.stats,
  }
  return { observation, shots: { cards: withCards.shot, empty: empty.shot } }
}

run()
  .then((report) => (window.__shaderCheck = report))
  .catch((error: unknown) => {
    window.__shaderCheck = {
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    }
  })
