import * as THREE from 'three'

import { STATEMENT_SELECTOR } from '../../lib/home-marks'
import { livePlaces } from '../../lib/room-model'
import { pixelRatioFor, throughGlass } from '../../lib/room-motion'
import { ROOM_TUNING } from '../../lib/room-tuning'
import type { HelixWork } from '../FeaturedWorks'
import { createGlass } from './glass'
import { createRoomLoops } from './loops'
import { createRoomScene, RoomUnavailable, type RoomFrame, type RoomPalette } from './scene'

export { RoomUnavailable }

/** What the room needs of a Featured Work: its Preview loop and its still (the loop's poster). */
export type RoomMedia = Pick<HelixWork, 'poster' | 'previewLoop'>

export type RoomRenderer = {
  /** Resolves once the stills have loaded or failed, or after `ROOM_TUNING.stillsWaitMs`: a place without its still keeps the placeholder grey. */
  ready: Promise<void>
  draw(frame: RoomFrame): void
  /** Matches the drawing buffer to the canvas's size on screen (device pixel ratio capped, lower on touch). */
  resize(): void
  destroy(): void
}

// The room is drawn in the site's greys as they are (no colour conversion): 0xededed is #ededed on screen.
THREE.ColorManagement.enabled = false

/** The tokens' fallbacks, so an unreadable token is never a silent black (playbook: canvas-colours). */
const FALLBACK: RoomPalette = { raised: 0x1a1a1a, placeholder: 0x2a2a2a, muted: 0x8f8f8f }

/** A CSS custom property as 0xRRGGBB, resolved by the browser itself (a 2D canvas takes any colour syntax). */
function token(element: Element, property: string, fallback: number): number {
  const value = getComputedStyle(element).getPropertyValue(property).trim()
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!value || !context) return fallback
  const sentinel = 'rgba(1, 2, 3, 0.5)'
  context.fillStyle = sentinel
  const before = context.fillStyle
  context.fillStyle = value
  if (context.fillStyle === before) return fallback
  context.fillRect(0, 0, 1, 1)
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data
  return (r! << 16) | (g! << 8) | b!
}

/** The room's greys, from the site's tokens. */
export const readPalette = (element: Element): RoomPalette => ({
  raised: token(element, '--color-background-raised', FALLBACK.raised),
  placeholder: token(element, '--color-placeholder', FALLBACK.placeholder),
  muted: token(element, '--color-text-muted', FALLBACK.muted),
})

/** Loads a still: CORS-clean, so the canvas it is painted on stays readable. Null if it can't. */
function loadStill(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

/**
 * The room on `canvas` (#127): a Three.js renderer drawing `scene.ts`. `onFail` runs when the
 * context is lost or a shader doesn't compile; creating it throws `RoomUnavailable` where WebGL2
 * can't start. Everything it makes is freed in `destroy`.
 */
export function createRoomRenderer(
  canvas: HTMLCanvasElement,
  works: readonly RoomMedia[],
  touch: boolean,
  onFail: (error: RoomUnavailable) => void,
): RoomRenderer {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // the room is drawn to a multisampled target (glass.ts)
      powerPreference: 'high-performance',
    })
  } catch (error) {
    throw new RoomUnavailable(error instanceof Error ? error.message : 'No WebGL2')
  }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace
  renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) =>
    onFail(
      new RoomUnavailable(
        `Room shader: ${gl.getProgramInfoLog(program) ?? ''}\n${gl.getShaderInfoLog(vertexShader) ?? ''}\n${gl.getShaderInfoLog(fragmentShader) ?? ''}`,
      ),
    )
  const lost = (event: Event) => {
    event.preventDefault()
    onFail(new RoomUnavailable('The WebGL context was lost'))
  }
  canvas.addEventListener('webglcontextlost', lost)

  const freeGl = () => {
    renderer.dispose()
    renderer.forceContextLoss()
  }
  let room: ReturnType<typeof createRoomScene>
  let glass: ReturnType<typeof createGlass>
  try {
    room = createRoomScene({
      places: Array.from({ length: ROOM_TUNING.places }, (_, place) => works[place] !== undefined),
      palette: readPalette(canvas),
      touch,
    })
    glass = createGlass(renderer)
  } catch (error) {
    canvas.removeEventListener('webglcontextlost', lost)
    freeGl()
    throw error
  }
  let destroyed = false
  // The Statement is the static hero's text, drawn on the sheet once its font is in (the page's text stays the heading).
  const statementElement = document.querySelector(STATEMENT_SELECTOR)
  const statement = statementElement?.textContent?.trim() ?? ''
  const family = statementElement ? getComputedStyle(statementElement).fontFamily : 'serif'
  room.setStatement(statement, family)
  const statementReady = (document.fonts?.load(`100px ${family}`, statement) ?? Promise.resolve())
    .catch(() => undefined) // no font: the sheet keeps the fallback face
    .then(() => {
      if (!destroyed) room.setStatement(statement, family)
    })
  const placed = works.slice(0, ROOM_TUNING.places)
  const stills: (HTMLImageElement | null)[] = placed.map(() => null)
  const loops = createRoomLoops(placed, canvas.parentElement ?? document.body, {
    paint: (place, video) => room.setFrame(place, video, placed[place]!.poster.focalPoint),
    restore: (place) => {
      const still = stills[place]
      if (still) room.setStill(place, still, placed[place]!.poster.focalPoint)
    },
  })
  const hasWork = Array.from({ length: ROOM_TUNING.places }, (_, place) => place < placed.length)
  const live: boolean[] = []
  // A still that hangs doesn't hold the room back: after the wait it draws with that place's placeholder.
  let waiting: ReturnType<typeof setTimeout> | undefined
  const give = new Promise<void>((resolve) => {
    waiting = setTimeout(resolve, ROOM_TUNING.stillsWaitMs)
  })
  const ready = Promise.race([
    Promise.all([
      statementReady,
      ...placed.map(async ({ poster }, place) => {
        const image = await loadStill(poster.src)
        if (!image || destroyed) return
        stills[place] = image
        room.setStill(place, image, poster.focalPoint)
      }),
    ]).then(() => undefined),
    give,
  ]).finally(() => clearTimeout(waiting))

  // What a frame hands the scene: the pointer mapped back through the bend (one object, reused).
  const seen: RoomFrame = { seconds: 0, dt: 0, progress: 0, pointer: null }
  const seenPointer = { nx: 0, ny: 0, dx: 0 }
  let aspect = 1

  return {
    ready,
    draw(frame) {
      seen.seconds = frame.seconds
      seen.dt = frame.dt
      seen.progress = frame.progress
      seen.pointer = frame.pointer && seenPointer
      if (frame.pointer) {
        throughGlass(frame.pointer.nx, frame.pointer.ny, aspect, seenPointer)
        seenPointer.dx = frame.pointer.dx
      }
      room.update(seen)
      // Only the screens nearest the camera play; the others hold their last frame or their still.
      loops.update(livePlaces(room.camera.position, room.screenCentres, hasWork, touch, live))
      glass.render(room.scene, room.camera)
    },
    resize() {
      renderer.setPixelRatio(pixelRatioFor(window.devicePixelRatio, touch))
      const width = Math.max(1, canvas.clientWidth)
      const height = Math.max(1, canvas.clientHeight)
      renderer.setSize(width, height, false)
      glass.setSize(canvas.width, canvas.height)
      aspect = width / height
      room.resize(width, height)
    },
    destroy() {
      destroyed = true
      clearTimeout(waiting)
      canvas.removeEventListener('webglcontextlost', lost)
      glass.dispose()
      loops.destroy()
      room.dispose()
      freeGl()
    },
  }
}
