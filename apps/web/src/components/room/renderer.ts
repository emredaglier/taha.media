import * as THREE from 'three'

import { ROOM_TUNING } from '../../lib/room-tuning'
import type { HelixWork } from '../FeaturedWorks'
import { createRoomScene, type RoomFrame, type RoomPalette } from './scene'

/** What the room needs of a Featured Work: its still (the Preview loop's poster). */
export type RoomMedia = Pick<HelixWork, 'poster'>

/** The room can't run here (no WebGL2, a shader that doesn't compile, a lost context): the static Home stays. */
export class RoomUnavailable extends Error {}

export type RoomRenderer = {
  /** Resolves once the stills have loaded (or failed: that place keeps its placeholder grey). */
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
      antialias: true,
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

  const room = createRoomScene({
    places: Array.from({ length: ROOM_TUNING.places }, (_, place) => works[place] !== undefined),
    palette: readPalette(canvas),
    touch,
  })
  let destroyed = false
  const ready = Promise.all(
    works.slice(0, ROOM_TUNING.places).map(async ({ poster }, place) => {
      const image = await loadStill(poster.src)
      if (image && !destroyed) room.setStill(place, image, poster.focalPoint)
    }),
  ).then(() => undefined)

  return {
    ready,
    draw(frame) {
      room.update(frame)
      renderer.render(room.scene, room.camera)
    },
    resize() {
      const { max, touchMax } = ROOM_TUNING.pixelRatio
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? touchMax : max))
      const width = Math.max(1, canvas.clientWidth)
      const height = Math.max(1, canvas.clientHeight)
      renderer.setSize(width, height, false)
      room.resize(width, height)
    },
    destroy() {
      destroyed = true
      canvas.removeEventListener('webglcontextlost', lost)
      room.dispose()
      renderer.dispose()
    },
  }
}
